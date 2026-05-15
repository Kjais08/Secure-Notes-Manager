from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
import secrets
import models, auth, database, schemas, encryption 

# Initialize the database
models.Base.metadata.create_all(bind=database.engine)

def ensure_note_columns():
    with database.engine.begin() as connection:
        note_columns = connection.execute(text("PRAGMA table_info(notes)")).fetchall()
        note_column_names = {column[1] for column in note_columns}

        if "title" not in note_column_names:
            connection.execute(text("ALTER TABLE notes ADD COLUMN title VARCHAR DEFAULT 'Untitled note'"))

        if "updated_at" not in note_column_names:
            connection.execute(text("ALTER TABLE notes ADD COLUMN updated_at DATETIME"))

        user_columns = connection.execute(text("PRAGMA table_info(users)")).fetchall()
        user_column_names = {column[1] for column in user_columns}

        if "security_question" not in user_column_names:
            connection.execute(text("ALTER TABLE users ADD COLUMN security_question VARCHAR"))

        if "security_answer_hash" not in user_column_names:
            connection.execute(text("ALTER TABLE users ADD COLUMN security_answer_hash VARCHAR"))

ensure_note_columns()

app = FastAPI(title="Secure Note API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ], # Allows your React app to talk to the API
    allow_origin_regex=r"http://.*:5173",
    allow_credentials=True,
    allow_methods=["*"], # Allows POST, GET, etc.
    allow_headers=["*"], # Allows our JWT tokens in the headers
)
# ---------------------------------------------------------
# REGISTRATION ROUTE
# ---------------------------------------------------------
@app.post("/register")
def register_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    if not user.security_question.strip() or not user.security_answer.strip():
        raise HTTPException(status_code=400, detail="Security question and answer are required")

    hashed_pw = auth.get_password_hash(user.password)
    security_answer_hash = auth.get_password_hash(user.security_answer.strip().lower())
    
    new_user = models.User(
        username=user.username,
        hashed_password=hashed_pw,
        security_question=user.security_question.strip(),
        security_answer_hash=security_answer_hash
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "User created successfully", "user_id": new_user.id}

@app.post("/recovery/question", response_model=schemas.RecoveryQuestionResponse)
def get_recovery_question(request: schemas.RecoveryQuestionRequest, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.username == request.username).first()

    if not user or not user.security_question:
        raise HTTPException(status_code=404, detail="No recovery question found for this user")

    return {"username": user.username, "security_question": user.security_question}

@app.post("/recovery/reset-password")
def reset_password_with_security_answer(request: schemas.PasswordRecoveryReset, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.username == request.username).first()

    if not user or not user.security_answer_hash:
        raise HTTPException(status_code=404, detail="No recovery setup found for this user")

    answer = request.security_answer.strip().lower()
    if not auth.verify_password(answer, user.security_answer_hash):
        raise HTTPException(status_code=400, detail="Security answer is incorrect")

    user.hashed_password = auth.get_password_hash(request.new_password)

    log_entry = models.AuditLog(user_id=user.id, action="RECOVERED_PASSWORD")
    db.add(log_entry)
    db.commit()

    return {"message": "Password reset successfully"}

# ---------------------------------------------------------
# LOGIN ROUTE 
# ---------------------------------------------------------
@app.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = auth.create_access_token(data={"sub": str(user.id)})
    
    log_entry = models.AuditLog(user_id=user.id, action="LOGIN_SUCCESS")
    db.add(log_entry)
    db.commit()

    return {"access_token": access_token, "token_type": "bearer"}

# ---------------------------------------------------------
# ROOT ROUTE
# ---------------------------------------------------------
@app.get("/")
def home():
    return {"status": "Secure Backend is Online"}

# ---------------------------------------------------------
# SECURE PROFILE ROUTE 
# ---------------------------------------------------------
@app.get("/users/me")
def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return {
        "user_id": current_user.id,
        "username": current_user.username,
        "message": "You bypass the Bouncer successfully!"
    }

@app.put("/users/me/password")
def change_password(passwords: schemas.PasswordChange, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    if not auth.verify_password(passwords.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.hashed_password = auth.get_password_hash(passwords.new_password)

    log_entry = models.AuditLog(user_id=current_user.id, action="CHANGED_PASSWORD")
    db.add(log_entry)
    db.commit()

    return {"message": "Password changed successfully"}

@app.get("/audit-logs", response_model=list[schemas.AuditLogResponse])
def get_audit_logs(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    logs = db.query(models.AuditLog).filter(
        models.AuditLog.user_id == current_user.id
    ).order_by(models.AuditLog.id.desc()).limit(30).all()

    return logs

# ---------------------------------------------------------
# SECURE NOTES ROUTES 
# ---------------------------------------------------------
@app.post("/notes", response_model=schemas.NoteResponse)
def create_note(note: schemas.NoteCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    # 1. Encrypt the plain text note BEFORE it hits the database
    encrypted_text = encryption.encrypt_note(note.content)
    
    # 2. Save it to the database (CHANGED user_id TO owner_id HERE)
    new_note = models.Note(owner_id=current_user.id, title=note.title.strip() or "Untitled note", encrypted_content=encrypted_text)
    db.add(new_note)
    
    # 3. Log the action (AuditLog still uses user_id, which is correct)
    log_entry = models.AuditLog(user_id=current_user.id, action="CREATED_NOTE")
    db.add(log_entry)
    
    db.commit()
    db.refresh(new_note)
    
    return {
        "id": new_note.id,
        "title": new_note.title,
        "content": note.content,
        "created_at": new_note.created_at,
        "updated_at": new_note.updated_at,
    }

@app.get("/notes", response_model=list[schemas.NoteResponse])
def get_my_notes(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    # 1. Fetch ONLY the notes belonging to this specific logged-in user (CHANGED user_id TO owner_id HERE)
    notes = db.query(models.Note).filter(models.Note.owner_id == current_user.id).order_by(models.Note.id.desc()).all()
    
    # 2. Decrypt them on the fly
    decrypted_notes = []
    for note in notes:
        plain_text = encryption.decrypt_note(note.encrypted_content)
        decrypted_notes.append({
            "id": note.id,
            "title": note.title or "Untitled note",
            "content": plain_text,
            "created_at": note.created_at,
            "updated_at": note.updated_at,
        })
        
    # 3. Log the action
    log_entry = models.AuditLog(user_id=current_user.id, action="VIEWED_NOTES")
    db.add(log_entry)
    db.commit()
    
    return decrypted_notes

@app.put("/notes/{note_id}", response_model=schemas.NoteResponse)
def update_note(note_id: int, note: schemas.NoteUpdate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    db_note = db.query(models.Note).filter(
        models.Note.id == note_id,
        models.Note.owner_id == current_user.id
    ).first()

    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")

    db_note.title = note.title.strip() or "Untitled note"
    db_note.encrypted_content = encryption.encrypt_note(note.content)

    log_entry = models.AuditLog(user_id=current_user.id, action="UPDATED_NOTE")
    db.add(log_entry)

    db.commit()
    db.refresh(db_note)

    return {
        "id": db_note.id,
        "title": db_note.title,
        "content": note.content,
        "created_at": db_note.created_at,
        "updated_at": db_note.updated_at,
    }

@app.delete("/notes/{note_id}")
def delete_note(note_id: int, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    db_note = db.query(models.Note).filter(
        models.Note.id == note_id,
        models.Note.owner_id == current_user.id
    ).first()

    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")

    db.query(models.SharedNote).filter(models.SharedNote.note_id == note_id).delete()
    db.delete(db_note)

    log_entry = models.AuditLog(user_id=current_user.id, action="DELETED_NOTE")
    db.add(log_entry)

    db.commit()

    return {"message": "Note deleted successfully", "note_id": note_id}

@app.post("/notes/{note_id}/share", response_model=schemas.ShareResponse)
def create_note_share(note_id: int, share: schemas.ShareCreate, request: Request, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    if not share.password.strip():
        raise HTTPException(status_code=400, detail="Share password is required")

    db_note = db.query(models.Note).filter(
        models.Note.id == note_id,
        models.Note.owner_id == current_user.id
    ).first()

    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")

    share_token = secrets.token_urlsafe(18)
    password_hash = auth.get_password_hash(share.password)

    shared_note = models.SharedNote(
        note_id=db_note.id,
        owner_id=current_user.id,
        share_token=share_token,
        password_hash=password_hash
    )
    db.add(shared_note)

    log_entry = models.AuditLog(user_id=current_user.id, action="CREATED_SHARE_LINK")
    db.add(log_entry)

    db.commit()

    frontend_origin = request.headers.get("origin") or "http://127.0.0.1:5173"

    return {
        "share_token": share_token,
        "share_url": f"{frontend_origin}/?share={share_token}"
    }

@app.post("/shared-notes/{share_token}/unlock", response_model=schemas.SharedNoteResponse)
def unlock_shared_note(share_token: str, unlock: schemas.SharedNoteUnlock, db: Session = Depends(database.get_db)):
    shared_note = db.query(models.SharedNote).filter(models.SharedNote.share_token == share_token).first()

    if not shared_note or not auth.verify_password(unlock.password, shared_note.password_hash):
        raise HTTPException(status_code=401, detail="Invalid shared note password")

    note = db.query(models.Note).filter(models.Note.id == shared_note.note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Shared note no longer exists")

    log_entry = models.AuditLog(user_id=shared_note.owner_id, action="OPENED_SHARED_NOTE")
    db.add(log_entry)
    db.commit()

    return {
        "title": note.title or "Untitled note",
        "content": encryption.decrypt_note(note.encrypted_content),
        "created_at": note.created_at,
        "updated_at": note.updated_at,
    }

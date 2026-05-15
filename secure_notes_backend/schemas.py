from datetime import datetime
from pydantic import BaseModel

class UserCreate(BaseModel):
    username: str
    password: str
    security_question: str
    security_answer: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class RecoveryQuestionRequest(BaseModel):
    username: str

class RecoveryQuestionResponse(BaseModel):
    username: str
    security_question: str

class PasswordRecoveryReset(BaseModel):
    username: str
    security_answer: str
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class NoteCreate(BaseModel):
    title: str = "Untitled note"
    content: str

class NoteUpdate(BaseModel):
    title: str
    content: str

class NoteResponse(BaseModel):
    id: int
    title: str
    content: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True

class AuditLogResponse(BaseModel):
    id: int
    action: str
    timestamp: datetime | None = None

    class Config:
        from_attributes = True

class ShareCreate(BaseModel):
    password: str

class ShareResponse(BaseModel):
    share_token: str
    share_url: str

class SharedNoteUnlock(BaseModel):
    password: str

class SharedNoteResponse(BaseModel):
    title: str
    content: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

from pydantic import BaseModel, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    username: str | None = None


class UserLoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=20,
                          description="Your registered unique username")
    password: str = Field(..., min_length=6)

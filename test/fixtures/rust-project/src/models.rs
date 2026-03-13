#[derive(Debug, Clone)]
pub struct User {
    pub id: u32,
    pub name: String,
    pub email: String,
}

#[derive(Debug)]
pub enum UserRole {
    Admin,
    Member,
    Guest,
}

pub type UserId = u32;

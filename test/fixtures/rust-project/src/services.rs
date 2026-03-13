use crate::models::User;
use crate::utils::validate_email;

pub struct UserService {
    users: Vec<User>,
}

impl UserService {
    pub fn new() -> Self {
        UserService { users: vec![] }
    }

    pub fn get_all(&self) -> Vec<User> {
        self.users.clone()
    }

    pub fn add(&mut self, user: User) -> Result<(), String> {
        if !validate_email(&user.email) {
            return Err("Invalid email".to_string());
        }
        self.users.push(user);
        Ok(())
    }

    fn find_by_id(&self, id: u32) -> Option<&User> {
        self.users.iter().find(|u| u.id == id)
    }
}

use crate::models::User;

pub trait Repository {
    fn get_by_id(&self, id: u32) -> Option<User>;
    fn get_all(&self) -> Vec<User>;
    fn save(&mut self, user: User) -> Result<(), String>;
    fn delete(&mut self, id: u32) -> bool;
}

pub trait Validator {
    fn validate(&self) -> bool;
    fn error_message(&self) -> String;
}

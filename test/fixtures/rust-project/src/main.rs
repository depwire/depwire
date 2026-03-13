mod models;
mod services;
mod utils;
mod traits;

use crate::services::UserService;

fn main() {
    let service = UserService::new();
    let users = service.get_all();
    println!("Found {} users", users.len());
}

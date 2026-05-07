use rusqlite::Connection;

mod embedded {
    use refinery::embed_migrations;
    embed_migrations!("./src/db/migrations_global");
}

pub fn run_migrations(conn: &mut Connection) -> Result<(), Box<dyn std::error::Error>> {
    embedded::migrations::runner().run(conn)?;
    Ok(())
}

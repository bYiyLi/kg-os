use rusqlite::Connection;
use rusqlite::ffi::{sqlite3, sqlite3_api_routines};
use rusqlite_ext::register_tokenizer;
use sqlite_jieba_tokenizer::jieba_tokenizer::JiebaTokenizer;
use std::ffi::{c_char, c_int};

#[unsafe(no_mangle)]
/// # Safety
/// SQLite must pass valid extension entrypoint pointers for the duration of this call.
pub unsafe extern "C" fn sqlite3_kgosjieba_init(
    db: *mut sqlite3,
    error: *mut *mut c_char,
    api: *mut sqlite3_api_routines,
) -> c_int {
    unsafe {
        Connection::extension_init2(db, error, api, |connection| {
            register_tokenizer::<JiebaTokenizer>(&connection, ())
                .map_err(|failure| rusqlite::Error::ModuleError(failure.to_string()))?;
            Ok(false)
        })
    }
}

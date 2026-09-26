#include "sqlite3ext.h"

SQLITE_EXTENSION_INIT1

#if defined(_WIN32)
__declspec(dllexport)
#endif
int sqlite3_shadowjieba_init(sqlite3 *db, char **error_message,
                             const sqlite3_api_routines *api_routines) {
  fts5_api *fts = 0;
  sqlite3_stmt *statement = 0;
  fts5_tokenizer tokenizer = {0};
  void *context = 0;
  int result;

  (void)error_message;
  SQLITE_EXTENSION_INIT2(api_routines);
  result = sqlite3_prepare_v2(db, "SELECT fts5(?1)", -1, &statement, 0);
  if (result == SQLITE_OK) {
    result = sqlite3_bind_pointer(statement, 1, &fts, "fts5_api_ptr", 0);
  }
  if (result == SQLITE_OK) {
    result = sqlite3_step(statement);
    if (result == SQLITE_ROW || result == SQLITE_DONE) result = SQLITE_OK;
  }
  if (statement != 0) {
    int finalized = sqlite3_finalize(statement);
    if (result == SQLITE_OK) result = finalized;
  }
  if (result != SQLITE_OK || fts == 0) return result == SQLITE_OK ? SQLITE_ERROR : result;

  result = fts->xFindTokenizer(fts, "unicode61", &context, &tokenizer);
  if (result != SQLITE_OK) return result;
  return fts->xCreateTokenizer(fts, "jieba", context, &tokenizer, 0);
}

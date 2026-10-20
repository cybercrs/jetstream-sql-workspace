importScripts('./vendor/sql-wasm.js', './core.js');
const ready = initSqlJs({locateFile: file => new URL('./vendor/' + file, self.location.href).href});
self.onmessage = async event => {
  const {id, csv, sql} = event.data;
  try {
    const SQL = await ready;
    const result = JetStream.executeQuery(SQL, csv, sql);
    self.postMessage({id, result});
  } catch (error) { self.postMessage({id, error: error.message || 'The query could not run.'}); }
};

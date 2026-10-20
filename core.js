(function (root) {
  'use strict';
  const fields = ['Weather_Severity', 'Crew_Reserve_Pct', 'System_Latency_Sec', 'Network_Collapse'];
  const schema = 'CREATE TABLE Daily_Operations (\n  Weather_Severity INTEGER,\n  Crew_Reserve_Pct REAL,\n  System_Latency_Sec REAL,\n  Network_Collapse INTEGER\n);';
  const definitions = [
    'Weather_Severity: weather severity score, 1 to 10.',
    'Crew_Reserve_Pct: crew reserve percentage; 8 means 8%.',
    'System_Latency_Sec: scheduling system response delay in seconds.',
    'Network_Collapse: 1 = collapse; 0 = normal operations.',
    'Each row represents one operating day.'
  ];
  function parseDataset(csv) {
    const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    if (lines.shift().trim() !== fields.join(',')) throw new Error('The database columns could not be read. Reload the page.');
    const rows = lines.map((line, index) => {
      const cells = line.split(',');
      if (cells.length !== 4 || cells.some(cell => !cell.trim() || !Number.isFinite(Number(cell)))) throw new Error(`Invalid database record at row ${index + 1}.`);
      const row = cells.map(Number);
      if (![0,1].includes(row[3])) throw new Error('Network_Collapse must be 0 or 1.');
      return row;
    });
    if (!rows.length) throw new Error('The database contains no records.');
    return rows;
  }
  function validateQuery(sql) {
    if (!sql.trim()) throw new Error('Enter a SQL query.');
    if (sql.length > 20000) throw new Error('The query is too long. Use fewer than 20,000 characters.');
    // Lex SQL so comments, literals and quoted identifiers do not become commands.
    let i = 0, ended = false;
    const words = [];
    while (i < sql.length) {
      const c = sql[i], next = sql[i+1];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '-' && next === '-') { i += 2; while (i < sql.length && sql[i] !== '\n') i++; continue; }
      if (c === '/' && next === '*') {
        const stop = sql.indexOf('*/', i+2);
        if (stop < 0) throw new Error('Close the SQL comment with */.');
        i = stop+2; continue;
      }
      if (ended) throw new Error('Run one query at a time.');
      if (c === ';') { ended = true; i++; continue; }
      if (c === "'" || c === '"' || c === '`' || c === '[') {
        const close = c === '[' ? ']' : c;
        i++; let closed = false;
        while (i < sql.length) {
          if (sql[i] === close) {
            if (c !== '[' && sql[i+1] === close) { i += 2; continue; }
            i++; closed = true; break;
          }
          i++;
        }
        if (!closed) throw new Error('Close the quoted text or field name.');
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let word = '';
        while (i < sql.length && /[A-Za-z0-9_$]/.test(sql[i])) word += sql[i++];
        words.push(word.toUpperCase()); continue;
      }
      i++;
    }
    if (!['SELECT','WITH'].includes(words[0])) throw new Error('Use a SELECT or WITH query.');
    const forbidden = new Set(['INSERT','UPDATE','DELETE','REPLACE','CREATE','DROP','ALTER','ATTACH','DETACH','PRAGMA','VACUUM','REINDEX','ANALYZE','BEGIN','COMMIT','ROLLBACK','SAVEPOINT','RELEASE','LOAD_EXTENSION']);
    if (words.some(word => forbidden.has(word))) throw new Error('Use a read-only SELECT or WITH query.');
    return sql;
  }
  function createDatabase(SQL, csv) {
    const rows = parseDataset(csv);
    const db = new SQL.Database();
    try {
      db.run(schema);
      const insert = db.prepare('INSERT INTO Daily_Operations VALUES (?, ?, ?, ?)');
      try { for (const row of rows) insert.run(row); } finally { insert.free(); }
      db.run('PRAGMA query_only = ON');
      return db;
    } catch (error) { db.close(); throw error; }
  }
  function executeQuery(SQL, csv, sql) {
    validateQuery(sql);
    const db = createDatabase(SQL, csv);
    let statement;
    try {
      statement = db.prepare(sql);
      const columns = statement.getColumnNames();
      const values = [];
      while (statement.step()) {
        if (values.length === 5000) throw new Error('The result exceeds 5,000 rows. Narrow the query and run it again.');
        values.push(statement.get());
      }
      return {columns, values};
    } finally { if (statement) statement.free(); db.close(); }
  }
  function csvCell(value) {
    let text = value === null || value === undefined ? '' : String(value);
    // Keep numeric negatives numeric; neutralize spreadsheet formulas in SQL text.
    if (typeof value === 'string' && /^[\s\uFEFF]*[=+\-@]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g,'""') + '"' : text;
  }
  function toCSV(result) {
    return [result.columns, ...result.values].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  const api = {fields, schema, definitions, parseDataset, validateQuery, createDatabase, executeQuery, toCSV};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JetStream = api;
})(typeof self !== 'undefined' ? self : globalThis);

(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const editor = $('query'), run = $('run'), download = $('download');
  const storageKey = 'jetstream.sql.v1';
  const pageSize = 25;
  let csv = '', result = null, resultSQL = '', page = 0, worker = null, timer = null, sequence = 0, busy = false;
  function status(message, error = false) {
    $('query-status').textContent = message;
    $('query-status').classList.toggle('error', error);
  }
  function saveQuery() {
    try { localStorage.setItem(storageKey, editor.value.slice(0, 20000)); } catch { /* Editing remains available when storage is disabled. */ }
  }
  function updateStale() {
    const changed = !!result && editor.value.trim() !== resultSQL;
    $('stale').hidden = !changed;
    download.disabled = !result || changed || busy;
  }
  function buildTable(target, data, caption) {
    target.replaceChildren();
    const table = document.createElement('table');
    const title = table.createCaption(); title.textContent = caption; title.className = 'sr-only';
    const header = table.createTHead().insertRow();
    for (const column of data.columns) {
      const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = column; header.append(cell);
    }
    const body = table.createTBody();
    for (const values of data.values) {
      const row = body.insertRow();
      for (const value of values) {
        const cell = row.insertCell();
        cell.textContent = value === null ? 'NULL' : String(value);
        if (typeof value !== 'number') cell.className = 'text';
      }
    }
    target.append(table);
    if (!data.values.length) {
      const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No rows matched this query.'; target.append(empty);
    }
  }
  function renderResults() {
    const start = page * pageSize;
    buildTable($('results'), {columns:result.columns, values:result.values.slice(start, start + pageSize)}, 'SQL query results');
    $('result-count').textContent = `${result.values.length} ${result.values.length === 1 ? 'row' : 'rows'} returned`;
    $('pagination').hidden = result.values.length <= pageSize;
    $('previous').disabled = page === 0;
    $('next').disabled = start + pageSize >= result.values.length;
    $('page-label').textContent = `${start + 1}–${Math.min(start + pageSize, result.values.length)} of ${result.values.length}`;
    updateStale();
  }
  function clearResults() {
    result = null; resultSQL = ''; page = 0;
    $('results').replaceChildren();
    const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Your query results will appear here.'; $('results').append(p);
    $('result-count').textContent = 'Run a query to view results.';
    $('pagination').hidden = true;
    updateStale();
  }
  function stopWorker() {
    if (worker) worker.terminate();
    worker = null; clearTimeout(timer); timer = null; busy = false; run.disabled = !csv; run.textContent = 'Run query';
    editor.removeAttribute('aria-busy'); updateStale();
  }
  function query() {
    if (busy || !csv) return;
    const sql = editor.value.trim();
    clearResults();
    try { JetStream.validateQuery(sql); } catch (error) { status(error.message, true); return; }
    saveQuery(); busy = true; run.disabled = true; run.textContent = 'Running…'; editor.setAttribute('aria-busy','true');
    status('Running query…');
    const id = ++sequence;
    worker = new Worker('./sql-worker.js');
    timer = setTimeout(() => { stopWorker(); status('The query took too long. Simplify it and run it again.', true); }, 6000);
    worker.onmessage = event => {
      if (event.data.id !== id) return;
      stopWorker();
      if (event.data.error) { status(event.data.error, true); return; }
      result = event.data.result; resultSQL = sql; page = 0;
      renderResults(); status('Query complete.');
    };
    worker.onerror = () => { stopWorker(); status('The SQL engine could not start. Reload the page and try again.', true); };
    worker.postMessage({id, csv, sql});
  }
  run.addEventListener('click', query);
  editor.addEventListener('input', () => { saveQuery(); updateStale(); });
  editor.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); query(); }
    if (event.key === 'Tab') { event.preventDefault(); editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end'); saveQuery(); updateStale(); }
  });
  $('clear').addEventListener('click', () => {
    stopWorker(); editor.value = ''; saveQuery(); clearResults(); status(csv ? 'Database ready.' : 'Loading database…'); editor.focus();
  });
  $('previous').addEventListener('click', () => { if (page > 0) { page--; renderResults(); } });
  $('next').addEventListener('click', () => { if (result && (page + 1) * pageSize < result.values.length) { page++; renderResults(); } });
  $('copy-schema').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('SQL dialect: SQLite\n\n' + JetStream.schema + '\n\n' + JetStream.definitions.join('\n'));
      $('schema-feedback').textContent = 'Schema copied.';
    } catch { $('schema-feedback').textContent = 'Copy unavailable. Select the table and field names to copy them.'; }
  });
  download.addEventListener('click', () => {
    if (!result || download.disabled) return;
    const blob = new Blob(['\uFEFF' + JetStream.toCSV(result)], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'JetStream SQL Extract.csv'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  try { editor.value = (localStorage.getItem(storageKey) || '').slice(0,20000); } catch { /* No saved query is required. */ }
  fetch('./JetStream%20Database.csv').then(response => {
    if (!response.ok) throw new Error('The database could not load. Reload the page.');
    return response.text();
  }).then(text => {
    const rows = JetStream.parseDataset(text); csv = text;
    $('dataset-count').textContent = `${rows.length} operating days`;
    buildTable($('source'), {columns:JetStream.fields, values:rows}, 'JetStream daily operating data');
    run.disabled = false; status('Database ready.');
  }).catch(error => { $('dataset-count').textContent = 'Database unavailable'; status(error.message, true); });
})();

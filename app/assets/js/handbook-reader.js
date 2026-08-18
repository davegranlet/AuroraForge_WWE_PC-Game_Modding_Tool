(function () {
  'use strict';

  var article = document.getElementById('handbook-article');
  var search = document.getElementById('handbook-search');
  var status = document.getElementById('handbook-search-status');
  var smaller = document.getElementById('handbook-font-smaller');
  var larger = document.getElementById('handbook-font-larger');
  var backTop = document.getElementById('handbook-back-top');
  var storageKey = 'auroraForgeHandbookFontScale';
  var scale = Number(localStorage.getItem(storageKey) || '1');

  function applyScale() {
    scale = Math.max(0.85, Math.min(1.35, scale));
    article.style.setProperty('--handbook-font-scale', String(scale));
    localStorage.setItem(storageKey, String(scale));
  }

  function clearSearchMarks() {
    article.querySelectorAll('mark.handbook-search-mark').forEach(function (mark) {
      mark.replaceWith(document.createTextNode(mark.textContent));
    });
    article.normalize();
  }

  function markText(node, query) {
    if (node.nodeType === Node.TEXT_NODE) {
      var text = node.nodeValue;
      var lower = text.toLowerCase();
      var at = lower.indexOf(query);
      if (at < 0) return 0;
      var fragment = document.createDocumentFragment();
      var count = 0;
      var cursor = 0;
      while (at >= 0) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, at)));
        var mark = document.createElement('mark');
        mark.className = 'handbook-search-mark';
        mark.textContent = text.slice(at, at + query.length);
        fragment.appendChild(mark);
        count += 1;
        cursor = at + query.length;
        at = lower.indexOf(query, cursor);
      }
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
      node.replaceWith(fragment);
      return count;
    }
    if (
      node.nodeType !== Node.ELEMENT_NODE ||
      node.matches('script, style, mark') ||
      node.closest('pre, code')
    ) {
      return 0;
    }
    var total = 0;
    Array.from(node.childNodes).forEach(function (child) {
      total += markText(child, query);
    });
    return total;
  }

  function runSearch() {
    clearSearchMarks();
    var query = search.value.trim().toLowerCase();
    if (!query) {
      status.textContent = 'All sections shown';
      return;
    }
    var count = markText(article, query);
    status.textContent = count === 1 ? '1 match found' : count + ' matches found';
    var first = article.querySelector('mark.handbook-search-mark');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (search) {
    var searchTimer;
    search.addEventListener('input', function () {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(runSearch, 180);
    });
  }
  if (smaller) {
    smaller.addEventListener('click', function () {
      scale -= 0.1;
      applyScale();
    });
  }
  if (larger) {
    larger.addEventListener('click', function () {
      scale += 0.1;
      applyScale();
    });
  }
  if (backTop) {
    backTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  applyScale();
})();

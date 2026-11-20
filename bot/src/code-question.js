function isPolishCodeQuestion(content) {
  const normalized = content
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (!/\bkod(?:u|zie)?\b/.test(normalized)) return false;

  return (
    /\b(?:jaki|jaka|jakie|gdzie|skad|jak|co|ktory|ktora|ktore|znajde|znalezc|dostane|dostac|wie|wiecie|ma|macie)\b/.test(normalized) ||
    /\bkod(?:u|zie)?\s*\?\s*$/.test(normalized.trim())
  );
}

module.exports = { isPolishCodeQuestion };

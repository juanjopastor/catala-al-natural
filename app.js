const DATA_URL = "./data.json";
const MAX_VISIBLE_RESULTS = 100;
const APOSTROPHES = new Set(["'", "\u2018", "\u2019", "\u02bc", "\uff07"]);
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const searchStatus = document.querySelector("#search-status");
const resultsCount = document.querySelector("#results-count");
const resultsList = document.querySelector("#results-list");

let recordsPromise;
let searchGeneration = 0;

function normalizeText(text) {
  const characters = Array.from(text.normalize("NFC"));
  const normalized = [];

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (APOSTROPHES.has(character)) {
      normalized.push("'");
    } else if (/\p{Pd}/u.test(character)) {
      normalized.push("-");
    } else if (
      character === "\u00b7" &&
      index > 0 &&
      index + 1 < characters.length &&
      characters[index - 1].toLocaleLowerCase("ca") === "l" &&
      characters[index + 1].toLocaleLowerCase("ca") === "l"
    ) {
      normalized.push(character);
    } else if (/[\p{L}\p{N}\p{M}]/u.test(character)) {
      normalized.push(character);
    } else {
      normalized.push(" ");
    }
  }

  return normalized.join("").toLocaleLowerCase("ca").trim().replace(/\s+/gu, " ");
}

function loadRecords() {
  if (!recordsPromise) {
    recordsPromise = fetch(DATA_URL).then((response) => {
      if (!response.ok) {
        throw new Error(`No s'ha pogut carregar la llista (HTTP ${response.status}).`);
      }
      return response.json();
    });
  }
  return recordsPromise;
}

function findMatchIndex(record, query) {
  const searchTerm = ` ${query} `;
  const searchableText = ` ${record.processedText} `;
  const matchIndex = searchableText.indexOf(searchTerm);

  if (matchIndex === -1 || matchIndex >= record.nextSubOffset) {
    return -1;
  }
  return matchIndex;
}

function formatTimestamp(seconds) {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(remainder).padStart(2, "0");

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${paddedMinutes}:${paddedSeconds}`;
}

function createResult(record) {
  const item = document.createElement("li");
  item.className = "result-card";

  const title = document.createElement("span");
  title.className = "result-title";
  title.textContent = record.title;
  item.append(title);

  const videoLink = document.createElement("a");
  videoLink.className = "result-timestamp";
  videoLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(record.videoId)}&t=${Math.floor(record.start)}s`;
  videoLink.target = "_blank";
  videoLink.rel = "noopener noreferrer";
  videoLink.setAttribute("aria-label", `Mira el vídeo des de ${formatTimestamp(record.start)}`);

  const playIcon = document.createElement("span");
  playIcon.className = "result-play";
  playIcon.setAttribute("aria-hidden", "true");
  playIcon.textContent = "▶";
  videoLink.append(playIcon, document.createTextNode(formatTimestamp(record.start)));
  item.append(videoLink);

  const caption = document.createElement("p");
  caption.className = "result-text";
  caption.textContent = record.text;
  item.append(caption);

  return item;
}

function showStatus(message, state = "info") {
  searchStatus.hidden = false;
  searchStatus.dataset.state = state;
  searchStatus.textContent = message;
}

function renderResults(matches, totalMatches) {
  resultsList.replaceChildren(...matches.map(createResult));
  resultsCount.textContent = totalMatches > 0 ? `(${totalMatches})` : "";

  if (totalMatches === 0) {
    showStatus("No hem trobat aquesta paraula o frase. Prova'n una altra.");
    return;
  }

  searchStatus.hidden = true;
  if (totalMatches > MAX_VISIBLE_RESULTS) {
    showStatus(
      `Mostrem els primers ${MAX_VISIBLE_RESULTS} de ${totalMatches} resultats. Prova una frase més curta.`,
    );
  }
}

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const generation = ++searchGeneration;
  resultsList.replaceChildren();
  resultsCount.textContent = "";

  const query = normalizeText(searchInput.value);
  if (!query) {
    showStatus("Escriu una paraula o una frase per començar.");
    searchInput.focus();
    return;
  }

  showStatus("Carregant els subtítols i cercant…");

  try {
    const records = await loadRecords();
    if (generation !== searchGeneration) {
      return;
    }

    const matches = [];
    let totalMatches = 0;

    for (const record of records) {
      if (findMatchIndex(record, query) === -1) {
        continue;
      }
      totalMatches += 1;
      if (matches.length < MAX_VISIBLE_RESULTS) {
        matches.push(record);
      }
    }

    renderResults(matches, totalMatches);
  } catch (error) {
    if (generation !== searchGeneration) {
      return;
    }
    recordsPromise = undefined;
    showStatus(
      `${error.message} Comprova que data.json és al costat d'aquesta pàgina i obre-la amb un servidor web local, no com un fitxer.`,
      "error",
    );
  }
});

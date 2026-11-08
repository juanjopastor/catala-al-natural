const CHANNELS_URL = "./channels.json";
const RESULTS_PER_PAGE = 20;
const APOSTROPHES = new Set(["'", "\u2018", "\u2019", "\u02bc", "\uff07"]);
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const searchStatus = document.querySelector("#search-status");
const resultsSection = document.querySelector(".results-section");
const channelSelect = document.querySelector("#channel-select");
const searchButton = searchForm.querySelector('button[type="submit"]');
const resultsCount = document.querySelector("#results-count");
const resultsList = document.querySelector("#results-list");
const resultsPagination = document.querySelector("#results-pagination");
const previousPageButton = document.querySelector("#previous-page");
const nextPageButton = document.querySelector("#next-page");
const pageIndicator = document.querySelector("#page-indicator");

let channels = [];
const recordsPromises = new Map();
let searchGeneration = 0;
let matchingRecords = [];
let currentPage = 1;

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

async function loadChannels() {
  const response = await fetch(CHANNELS_URL);
  if (!response.ok) {
    throw new Error(`No s'ha pogut carregar la llista de canals (HTTP ${response.status}).`);
  }

  const config = await response.json();
  if (
    config === null ||
    typeof config !== "object" ||
    !Array.isArray(config.channels) ||
    config.channels.length === 0 ||
    config.channels.some(
      (channel) =>
        channel === null ||
        typeof channel !== "object" ||
        typeof channel.name !== "string" ||
        !channel.name.trim() ||
        typeof channel.file !== "string" ||
        !channel.file.trim(),
    )
  ) {
    throw new Error("La llista de canals no té el format esperat.");
  }

  channels = config.channels;
  channelSelect.replaceChildren();
  for (const channel of channels) {
    const option = document.createElement("option");
    option.value = channel.file;
    option.textContent = channel.name;
    channelSelect.append(option);
  }
  channelSelect.disabled = false;
  searchButton.disabled = false;
}

function loadRecords(file) {
  if (!recordsPromises.has(file)) {
    const recordsPromise = fetch(file).then((response) => {
      if (!response.ok) {
        throw new Error(`No s'ha pogut carregar ${file} (HTTP ${response.status}).`);
      }
      return response.json();
    }).catch((error) => {
      recordsPromises.delete(file);
      throw error;
    });
    recordsPromises.set(file, recordsPromise);
  }
  return recordsPromises.get(file);
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

function renderResults() {
  const totalMatches = matchingRecords.length;
  const totalPages = Math.ceil(totalMatches / RESULTS_PER_PAGE);
  const start = (currentPage - 1) * RESULTS_PER_PAGE;
  const pageMatches = matchingRecords.slice(start, start + RESULTS_PER_PAGE);

  resultsList.replaceChildren(...pageMatches.map(createResult));
  resultsCount.textContent = totalMatches > 0 ? `(${totalMatches})` : "";
  resultsPagination.hidden = totalPages <= 1;

  if (totalMatches === 0) {
    showStatus("No hem trobat aquesta paraula o frase. Prova'n una altra.");
    return;
  }

  searchStatus.hidden = true;
  pageIndicator.textContent = `Pàgina ${currentPage} de ${totalPages}`;
  previousPageButton.disabled = currentPage === 1;
  nextPageButton.disabled = currentPage === totalPages;
}

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (channels.length === 0) {
    return;
  }

  const generation = ++searchGeneration;
  matchingRecords = [];
  currentPage = 1;
  resultsList.replaceChildren();
  resultsCount.textContent = "";
  resultsPagination.hidden = true;

  const query = normalizeText(searchInput.value);
  if (!query) {
    showStatus("Escriu una paraula o una frase per començar.");
    searchInput.focus();
    return;
  }

  showStatus("Carregant els subtítols i cercant…");
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const selectedChannel = channels.find((channel) => channel.file === channelSelect.value);
    if (!selectedChannel) {
      throw new Error("Selecciona un canal vàlid.");
    }

    const records = await loadRecords(selectedChannel.file);
    if (generation !== searchGeneration) {
      return;
    }

    for (const record of records) {
      if (findMatchIndex(record, query) !== -1) {
        matchingRecords.push(record);
      }
    }

    renderResults();
  } catch (error) {
    if (generation !== searchGeneration) {
      return;
    }
    showStatus(
      `${error.message} Comprova la ruta del fitxer a ${CHANNELS_URL} i obre la web amb un servidor local, no com un fitxer.`,
      "error",
    );
  }
});

channelSelect.addEventListener("change", () => {
  searchGeneration += 1;
  matchingRecords = [];
  currentPage = 1;
  resultsList.replaceChildren();
  resultsCount.textContent = "";
  resultsPagination.hidden = true;
  showStatus("Prem «Cerca» per cercar en aquest canal.");
});

previousPageButton.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage -= 1;
    renderResults();
  }
});

nextPageButton.addEventListener("click", () => {
  const totalPages = Math.ceil(matchingRecords.length / RESULTS_PER_PAGE);
  if (currentPage < totalPages) {
    currentPage += 1;
    renderResults();
  }
});

loadChannels().catch((error) => {
  searchButton.disabled = true;
  showStatus(
    `${error.message} Comprova que ${CHANNELS_URL} és al costat d'aquesta pàgina i obre-la amb un servidor web local, no com un fitxer.`,
    "error",
  );
});

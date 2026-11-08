const CHANNELS_URL = "./channels.json";
const RESULTS_PER_PAGE = 20;
const LOCAL_FILE_ACTION = "__load_local_json__";
const LOCAL_FILE_VALUE = "__local_json__";
const APOSTROPHES = new Set(["'", "\u2018", "\u2019", "\u02bc", "\uff07"]);
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const searchStatus = document.querySelector("#search-status");
const resultsSection = document.querySelector(".results-section");
const channelSelect = document.querySelector("#channel-select");
const localJsonInput = document.querySelector("#local-json-input");
const searchButton = searchForm.querySelector('button[type="submit"]');
const resultsCount = document.querySelector("#results-count");
const resultsList = document.querySelector("#results-list");
const resultsPaginations = document.querySelectorAll(".results-pagination");
const previousPageButtons = document.querySelectorAll(".previous-page-button");
const nextPageButtons = document.querySelectorAll(".next-page-button");
const pageIndicators = document.querySelectorAll(".page-indicator");
const resultsHeading = document.querySelector("#results-heading");

let channels = [];
const recordsPromises = new Map();
let localRecords = null;
let previousChannelValue = "";
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
  const response = await fetch(CHANNELS_URL, {
    cache: "no-store",
    priority: "high",
  });
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
  const localFileOption = document.createElement("option");
  localFileOption.value = LOCAL_FILE_ACTION;
  localFileOption.textContent = "Carrega un fitxer JSON local…";
  channelSelect.append(localFileOption);
  previousChannelValue = channelSelect.value;
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
    }).then(prepareVideoGroups).catch((error) => {
      recordsPromises.delete(file);
      throw error;
    });
    recordsPromises.set(file, recordsPromise);
  }
  return recordsPromises.get(file);
}

function prepareVideoGroups(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === "object" && Array.isArray(data.v)) {
    if (
      !data.v.every(
        (video) =>
          video &&
          typeof video.i === "string" &&
          typeof video.t === "string" &&
          Array.isArray(video.s) &&
          video.s.every((subtitle) => subtitle && typeof subtitle.t === "string"),
      )
    ) {
      throw new Error("El fitxer de dades no té un format vàlid.");
    }

    data.videos = data.v;
    delete data.v;

    for (const video of data.videos) {
      video.videoId = video.i;
      video.title = video.t;
      video.subtitles = video.s;
      delete video.i;
      delete video.t;
      delete video.s;

      for (const subtitle of video.subtitles) {
        subtitle.start = subtitle.s;
        subtitle.text = subtitle.t;
        delete subtitle.s;
        delete subtitle.t;
      }
    }
  }

  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray(data.videos) ||
    !data.videos.every(
      (video) =>
        video &&
        typeof video.videoId === "string" &&
        typeof video.title === "string" &&
        Array.isArray(video.subtitles) &&
        video.subtitles.every((subtitle) => typeof subtitle.text === "string"),
    )
  ) {
    throw new Error("El fitxer de dades no té un format vàlid.");
  }

  for (const video of data.videos) {
    const normalizedTexts = video.subtitles.map((subtitle) =>
      normalizeText(subtitle.text),
    );
    for (let index = 0; index < video.subtitles.length; index += 1) {
      const currentText = normalizedTexts[index];
      const nextText = normalizedTexts[index + 1] || "";
      video.subtitles[index].processedText = `${currentText} ${nextText}`.trim();
      video.subtitles[index].nextSubOffset = currentText.length;
    }
  }

  return data;
}

function* iterateVideoGroups(data) {
  if (Array.isArray(data)) {
    for (const subtitle of data) {
      yield {
        videoId: subtitle.videoId,
        title: subtitle.title,
        subtitles: [subtitle],
      };
    }
    return;
  }

  if (data && typeof data === "object" && Array.isArray(data.videos)) {
    yield* data.videos;
    return;
  }

  throw new Error("El fitxer de dades no té un format vàlid.");
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

function createResult(record, video) {
  const item = document.createElement("li");
  item.className = "result-card";

  const videoLink = document.createElement("a");
  videoLink.className = "result-card-link";
  videoLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}&t=${Math.floor(record.start)}s`;
  videoLink.target = "_blank";
  videoLink.rel = "noopener noreferrer";
  videoLink.setAttribute(
    "aria-label",
    `Mira ${video.title} des de ${formatTimestamp(record.start)}`,
  );

  const title = document.createElement("span");
  title.className = "result-title";
  title.textContent = video.title;

  const timestamp = document.createElement("span");
  timestamp.className = "result-timestamp";
  const playIcon = document.createElement("span");
  playIcon.className = "result-play";
  playIcon.setAttribute("aria-hidden", "true");
  playIcon.textContent = "▶";
  timestamp.append(playIcon, document.createTextNode(formatTimestamp(record.start)));

  const caption = document.createElement("p");
  caption.className = "result-text";
  caption.textContent = record.text;
  videoLink.append(title, timestamp, caption);
  item.append(videoLink);

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

  resultsList.replaceChildren(
    ...pageMatches.map(({ subtitle, video }) => createResult(subtitle, video)),
  );
  resultsCount.textContent = totalMatches > 0 ? `(${totalMatches})` : "";
  for (const pagination of resultsPaginations) {
    pagination.hidden = totalPages <= 1;
  }

  if (totalMatches === 0) {
    showStatus("No hem trobat aquesta paraula o frase. Prova'n una altra.");
    return;
  }

  searchStatus.hidden = true;
  for (const indicator of pageIndicators) {
    indicator.textContent = `Pàgina ${currentPage} de ${totalPages}`;
  }
  for (const button of previousPageButtons) {
    button.disabled = currentPage === 1;
  }
  for (const button of nextPageButtons) {
    button.disabled = currentPage === totalPages;
  }
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
  for (const pagination of resultsPaginations) {
    pagination.hidden = true;
  }

  const query = normalizeText(searchInput.value);
  if (!query) {
    showStatus("Escriu una paraula o una frase per començar.");
    searchInput.focus();
    return;
  }

  showStatus("Carregant els subtítols i cercant…");
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    let records;
    if (channelSelect.value === LOCAL_FILE_VALUE) {
      if (!localRecords) {
        throw new Error("Torna a carregar el fitxer JSON local.");
      }
      records = localRecords;
    } else {
      const selectedChannel = channels.find((channel) => channel.file === channelSelect.value);
      if (!selectedChannel) {
        throw new Error("Selecciona un canal vàlid.");
      }
      records = await loadRecords(selectedChannel.file);
    }

    if (!records) {
      throw new Error("Selecciona un canal vàlid.");
    }

    if (generation !== searchGeneration) {
      return;
    }

    for (const video of iterateVideoGroups(records)) {
      for (const subtitle of video.subtitles) {
        if (findMatchIndex(subtitle, query) !== -1) {
          matchingRecords.push({ subtitle, video });
        }
      }
    }

    renderResults();
  } catch (error) {
    if (generation !== searchGeneration) {
      return;
    }
    const helpText = channelSelect.value === LOCAL_FILE_VALUE
      ? ""
      : ` Comprova la ruta del fitxer a ${CHANNELS_URL} i obre la web amb un servidor local, no com un fitxer.`;
    showStatus(
      `${error.message}${helpText}`,
      "error",
    );
  }
});

channelSelect.addEventListener("change", () => {
  if (channelSelect.value === LOCAL_FILE_ACTION) {
    channelSelect.value = previousChannelValue;
    localJsonInput.click();
    return;
  }

  previousChannelValue = channelSelect.value;
  searchGeneration += 1;
  matchingRecords = [];
  currentPage = 1;
  resultsList.replaceChildren();
  resultsCount.textContent = "";
  for (const pagination of resultsPaginations) {
    pagination.hidden = true;
  }
  showStatus("Prem «Cerca» per cercar en aquest canal.");
});

localJsonInput.addEventListener("change", async () => {
  const file = localJsonInput.files[0];
  if (!file) {
    return;
  }

  try {
    const records = prepareVideoGroups(JSON.parse(await file.text()));
    localRecords = records;

    let localOption = channelSelect.querySelector(
      `option[value="${LOCAL_FILE_VALUE}"]`,
    );
    if (!localOption) {
      localOption = document.createElement("option");
      localOption.value = LOCAL_FILE_VALUE;
      channelSelect.insertBefore(localOption, channelSelect.lastElementChild);
    }
    localOption.textContent = file.name;
    channelSelect.value = LOCAL_FILE_VALUE;
    previousChannelValue = LOCAL_FILE_VALUE;

    searchGeneration += 1;
    matchingRecords = [];
    currentPage = 1;
    resultsList.replaceChildren();
    resultsCount.textContent = "";
    for (const pagination of resultsPaginations) {
      pagination.hidden = true;
    }
    showStatus("Fitxer carregat. Prem «Cerca» per cercar-hi.");
  } catch (error) {
    showStatus(
      `No s'ha pogut carregar el fitxer JSON: ${error.message}`,
      "error",
    );
  } finally {
    localJsonInput.value = "";
  }
});

function changePage(pageChange, shouldScroll) {
  const totalPages = Math.ceil(matchingRecords.length / RESULTS_PER_PAGE);
  const nextPage = currentPage + pageChange;
  if (nextPage < 1 || nextPage > totalPages) {
    return;
  }

  currentPage = nextPage;
  renderResults();
  if (shouldScroll) {
    resultsHeading.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

for (const button of previousPageButtons) {
  button.addEventListener("click", () => {
    changePage(-1, button.closest(".results-pagination-bottom") !== null);
  });
}

for (const button of nextPageButtons) {
  button.addEventListener("click", () => {
    changePage(1, button.closest(".results-pagination-bottom") !== null);
  });
}

loadChannels().catch((error) => {
  searchButton.disabled = true;
  const option = document.createElement("option");
  option.textContent = "No s'han pogut carregar els canals";
  channelSelect.replaceChildren(option);
  showStatus(
    `${error.message} Comprova que ${CHANNELS_URL} és al costat d'aquesta pàgina i obre-la amb un servidor web local, no com un fitxer.`,
    "error",
  );
});

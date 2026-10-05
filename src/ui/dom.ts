// Centralised DOM references.

export const playlistListEl = document.getElementById("playlistList") as HTMLUListElement;
export const newPlaylistNameEl = document.getElementById("newPlaylistName") as HTMLInputElement;
export const createPlaylistBtn = document.getElementById("createPlaylistBtn") as HTMLButtonElement;
export const renamePlaylistBtn = document.getElementById("renamePlaylistBtn") as HTMLButtonElement;
export const deletePlaylistBtn = document.getElementById("deletePlaylistBtn") as HTMLButtonElement;

export const fileInput = document.getElementById("fileInput") as HTMLInputElement;
export const folderInput = document.getElementById("folderInput") as HTMLInputElement;
export const addFilesBtn = document.getElementById("addFilesBtn") as HTMLButtonElement;
export const addFolderBtn = document.getElementById("addFolderBtn") as HTMLButtonElement;
export const addFirstBtn = document.getElementById("addFirstBtn") as HTMLButtonElement;
export const addLastBtn = document.getElementById("addLastBtn") as HTMLButtonElement;

export const searchInput = document.getElementById("searchInput") as HTMLInputElement;
export const shuffleBtn = document.getElementById("shuffleBtn") as HTMLButtonElement;
export const repeatBtn = document.getElementById("repeatBtn") as HTMLButtonElement;
export const countLabel = document.getElementById("countLabel") as HTMLSpanElement;
export const playlistCount = document.getElementById("playlistCount") as HTMLSpanElement;

export const songListEl = document.getElementById("songList") as HTMLUListElement;
export const emptyStateEl = document.getElementById("emptyState") as HTMLDivElement;
export const dropZoneTop = document.getElementById("dropZoneTop") as HTMLDivElement;
export const playlistContainer = document.getElementById("playlistContainer") as HTMLDivElement;

export const audioEl = document.getElementById("audio") as HTMLAudioElement;
export const currentTitleEl = document.getElementById("currentTitle") as HTMLElement;
export const currentMetaEl = document.getElementById("currentMeta") as HTMLElement;
export const queueIndicatorEl = document.getElementById("queueIndicator") as HTMLElement;
export const playPauseBtn = document.getElementById("playPauseBtn") as HTMLButtonElement;
export const prevBtn = document.getElementById("prevBtn") as HTMLButtonElement;
export const nextBtn = document.getElementById("nextBtn") as HTMLButtonElement;
export const volumeBar = document.getElementById("volumeBar") as HTMLInputElement;
export const heroRingEl = document.getElementById("heroRing") as HTMLElement | null;
export const heroRingProgressEl = document.getElementById("heroRingProgress") as unknown as SVGCircleElement | null;
export const heroRingKnobEl = document.getElementById("heroRingKnob") as unknown as SVGCircleElement | null;
export const heroRingTooltipEl = document.getElementById("heroRingTooltip") as HTMLElement | null;
export const heroTimeEl = document.getElementById("heroTime") as HTMLElement | null;
export const dockRingEl = document.getElementById("dockRing") as HTMLElement | null;
export const dockRingProgressEl = document.getElementById("dockRingProgress") as unknown as SVGCircleElement | null;
export const dockTimeEl = document.getElementById("dockTime") as HTMLElement | null;
export const queueToggleBtn = document.getElementById("queueToggle") as HTMLButtonElement | null;
export const queuePanelWrapEl = document.getElementById("queuePanelWrap") as HTMLElement | null;
export const playerBarEl = document.getElementById("playerBar") as HTMLElement;
export const seekBackBtn = document.getElementById("seekBackBtn") as HTMLButtonElement | null;
export const seekForwardBtn = document.getElementById("seekForwardBtn") as HTMLButtonElement | null;
export const speedBtn = document.getElementById("speedBtn") as HTMLButtonElement | null;
export const muteBtn = document.getElementById("muteBtn") as HTMLButtonElement | null;
export const volumeReadoutEl = document.getElementById("volumeReadout") as HTMLElement | null;
export const muteIconEl = document.getElementById("muteIcon") as HTMLElement | null;
export const seekHintEl = document.getElementById("seekHint") as HTMLElement | null;
export const clearSearchBtn = document.getElementById("clearSearchBtn") as HTMLButtonElement | null;
export const searchResultLiveEl = document.getElementById("searchResultLive") as HTMLElement | null;
export const dragHintEl = document.getElementById("dragHint") as HTMLElement | null;
export const noSearchResultsEl = document.getElementById("noSearchResults") as HTMLElement | null;

export const linkedViewEl = document.getElementById("linkedView") as HTMLElement | null;
export const linkedCaptionEl = document.getElementById("linkedCaption") as HTMLElement | null;
export const visualizerEl = document.getElementById("visualizer") as HTMLCanvasElement | null;
export const dropOverlayEl = document.getElementById("dropOverlay") as HTMLElement | null;
export const clearLibraryBtn = document.getElementById("clearLibraryBtn") as HTMLButtonElement | null;
export const coverEl = document.getElementById("coverArt") as HTMLElement | null;
export const playingFromEl = document.getElementById("playingFrom") as HTMLElement | null;
export const shortcutsDialogEl = document.getElementById("shortcutsDialog") as HTMLElement | null;
export const openSearchBtn = document.getElementById("openSearchBtn") as HTMLButtonElement | null;
export const searchPanelEl = document.getElementById("searchPanel") as HTMLElement | null;
export const searchOnlineInput = document.getElementById("searchOnlineInput") as HTMLInputElement | null;
export const searchResultsEl = document.getElementById("searchResults") as HTMLElement | null;
export const searchResultCountEl = document.getElementById("searchResultCount") as HTMLElement | null;
export const searchEmptyEl = document.getElementById("searchEmpty") as HTMLElement | null;
export const searchErrorEl = document.getElementById("searchError") as HTMLElement | null;

// New editorial elements
export const statArtistEl = document.getElementById("statArtist") as HTMLElement | null;
export const statTimeEl = document.getElementById("statTime") as HTMLElement | null;
export const statNextEl = document.getElementById("statNext") as HTMLElement | null;
export const dockTitleEl = document.getElementById("dockTitle") as HTMLElement | null;
export const dockArtistEl = document.getElementById("dockArtist") as HTMLElement | null;
export const dockCoverEl = document.getElementById("dockCover") as HTMLElement | null;
export const heroEmptyCtaEl = document.getElementById("heroEmptyCta") as HTMLElement | null;
export const heroAddSongsBtn = document.getElementById("heroAddSongsBtn") as HTMLButtonElement | null;
export const playlistsToggleBtn = document.getElementById("playlistsToggle") as HTMLButtonElement | null;
export const shortcutsToggleBtn = document.getElementById("shortcutsToggle") as HTMLButtonElement | null;
export const menuToggleBtn = document.getElementById("menuToggle") as HTMLButtonElement | null;
export const menuSheetEl = document.getElementById("menuSheet") as HTMLElement | null;
export const closeMenuBtn = document.getElementById("closeMenuBtn") as HTMLButtonElement | null;
export const closeShortcutsBtn = document.getElementById("closeShortcutsBtn") as HTMLButtonElement | null;

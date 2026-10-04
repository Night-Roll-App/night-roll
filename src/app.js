import { S, prof } from "./state.js";
import { iconSvg } from "./ui/icons.js";
import { setVolBtn, setPlayBtn, setControl } from "./ui/controls.js";
import { secToTick } from "./midi/parse.js";
import { parseMidi } from "./midi/parse.js";
import { tickToSec } from "./midi/parse.js";
import { writeMidi } from "./midi/write.js";
import { SF_MAJOR } from "./theory/chords.js";
import { spellPc } from "./theory/chords.js";
import { pitchName } from "./theory/chords.js";
import { nameChord } from "./theory/chords.js";
import { LETTER_PC } from "./theory/chords.js";
import { CHORD_FLAT } from "./theory/chords.js";
import { SHARP_SPELL } from "./theory/chords.js";
import { spellFor } from "./theory/chords.js";
import { chordSym } from "./theory/chords.js";
import { splitProgression } from "./theory/chords.js";
import { parseNumeral } from "./theory/chords.js";
import { parseChordSym } from "./theory/chords.js";
import { CHORD_TEMPLATES } from "./theory/chords.js";
import { chordQualCompose } from "./theory/chords.js";
import { chordQualParse } from "./theory/chords.js";
import { CHORD_BASES } from "./theory/chords.js";
import { CHORD_EXTS } from "./theory/chords.js";
import { spellMemo } from "./theory/chords.js";
import { LETTERS } from "./theory/chords.js";
import { keySpelling } from "./theory/chords.js";
import { NUM_DEG } from "./theory/chords.js";
import { MAJ_STEP } from "./theory/chords.js";
import { MIN_STEP } from "./theory/chords.js";
import { pearsonCorr } from "./theory/key.js";
import { keyNameFor } from "./theory/key.js";
import { TONIC_SPELL } from "./theory/key.js";
import { fileKeyAt } from "./theory/key.js";
import { checkMeterVsFile } from "./theory/key.js";
import { FIFTHS_POS } from "./theory/key.js";
import { MODE_FIFTHS } from "./theory/key.js";
import { trueSf } from "./theory/key.js";
import { keyNameToSf } from "./theory/key.js";
import { MODE_OFFSET } from "./theory/key.js";
import { LETTER_SF } from "./theory/key.js";
import { MODE_SF_OFFSET } from "./theory/key.js";
import { barTicks } from "./model/rollnotes.js";
import { noteToJSON } from "./model/rollnotes.js";
import { deriveNoteTypes } from "./model/rollnotes.js";
import { jsonToRawNote } from "./model/rollnotes.js";
import { resolveNote } from "./model/rollnotes.js";
import { applyChop } from "./model/rollnotes.js";
import { notesBase } from "./model/rollnotes.js";
import { parseRollnotes } from "./model/rollnotes.js";
import { ROLLNOTES_LOCK_MSG } from "./model/rollnotes.js";
import { notesStoreKey } from "./model/rollnotes.js";
import { dedupedNotesWithIndex } from "./model/rollnotes.js";
import { baseName } from "./model/rollnotes.js";
import { audioDirText } from "./model/rollnotes.js";
import { trackDirText } from "./model/rollnotes.js";
import { serializeRollnotes } from "./model/rollnotes.js";
import { serializeNotesList } from "./model/rollnotes.js";
import { serializeRollnotesStamped } from "./model/rollnotes.js";
import { ROLLNOTES_FORMAT } from "./model/rollnotes.js";
import { ROLLNOTES_MAX_VERSION } from "./model/rollnotes.js";
import { parseRollnotesJSON } from "./model/rollnotes.js";
import { trackIsDrums } from "./model/grid.js";
import { secDepthCap } from "./model/grid.js";
import { beatTicks } from "./model/grid.js";
import { beatsPerBarDisp } from "./model/grid.js";
import { effTs } from "./model/grid.js";
import { gridAnchorTick } from "./model/grid.js";
import { moveSnapTicks } from "./model/grid.js";
import { cursorTapSnapTicks } from "./model/grid.js";
import { cursorDragSnapTicks } from "./model/grid.js";
import { pencilTicks } from "./model/grid.js";
import { gridCellStart } from "./model/grid.js";
import { snapTickAbs } from "./model/grid.js";
import { pencilCellAt } from "./model/grid.js";
import { isTripletDur } from "./model/grid.js";
import { songHas32nds } from "./model/grid.js";
import { beatsPerBarEff } from "./model/grid.js";
import { catalogHas } from "./model/catalog.js";
import { groupOf } from "./model/catalog.js";
import { folderTitle } from "./model/catalog.js";
import { folderOf } from "./model/catalog.js";
import { titleCaseSlug } from "./model/catalog.js";
import { segTitle } from "./model/catalog.js";
import { publishedPaths } from "./model/catalog.js";
import { FOLDER_NAMES } from "./model/catalog.js";
import { albumFolders } from "./model/catalog.js";
import { editsKey } from "./model/edits.js";
import { isLocalDraft } from "./model/edits.js";
import { updateClearBtn } from "./model/edits.js";
import { overlayNoteSig } from "./model/edits.js";
import { LINK_SONGS } from "./platform/base.js";
import { recentSongs } from "./platform/base.js";
import { saveRecentSongsRaw } from "./platform/base.js";
import { RECENT_MAX } from "./platform/base.js";
import { songPathFromURL } from "./platform/base.js";
import { setDocTitle } from "./platform/base.js";
import { PERF_FLAGS } from "./platform/base.js";
import { rememberLastSong } from "./platform/base.js";
import { movedPath } from "./platform/base.js";
import { songShareURL } from "./platform/base.js";
import { PERF_NOSCENE } from "./platform/base.js";
import { linkRepoLabel } from "./platform/base.js";
import { clearRecentSongs } from "./platform/base.js";
import { albumParamFromURL } from "./platform/base.js";
import { linkSongsBase } from "./platform/base.js";
import { RECENT_KEY } from "./platform/base.js";
import { MOVED_DIRS } from "./platform/base.js";
// Song links are the song's PATH without its extension (Josh, 2026-09-14):
//   https://…/night-roll/albums/compositions/nightroll/ambush   → the player
//   https://…/night-roll/albums/compositions/nightroll/ambush.mid → the file
// The path form is served by 404.html (Pages has no such file), which sends
// the browser to ?song=…; the app then puts the path form back in the address
// bar. Old ?song=…mid links keep opening the player. APP_BASE is the app's own
// directory, snapshotted before the address bar ever changes, and pinned as
// <base> so relative fetches (soundfonts, albums/, tools/nsf) never follow the
// song path.
// EDITION moved to src/edition.js (docs/split-plan.md §1): the packager
// (tools/package.mjs) now rewrites THAT file's one line to "app" for the
// store build. The app edition hides what only makes sense on the public
// study site (class="webonly"), nothing else changes.
import { EDITION } from "./edition.js";
import { hasExistingNightRollPrefs } from "./platform/mode.js";
import { appMode } from "./platform/mode.js";
import { analysisAvailable } from "./platform/mode.js";
import { setAppMode } from "./platform/mode.js";
import { audioSessionType } from "./platform/native.js";
import { nativeCall } from "./platform/native.js";
import { draftStoreKey } from "./platform/storage.js";
import { songsURL } from "./platform/storage.js";
import { cfg } from "./platform/storage.js";
import { idbDraftMove } from "./platform/storage.js";
import { idbDraftGet } from "./platform/storage.js";
import { idbDraftDelete } from "./platform/storage.js";
import { nsfURL } from "./platform/storage.js";
import { repoApi } from "./platform/storage.js";
import { apiError } from "./platform/storage.js";
import { repoName } from "./platform/storage.js";
import { idbNsfGet } from "./platform/storage.js";
import { idbNsfPut } from "./platform/storage.js";
import { idbAudioGet } from "./platform/storage.js";
import { saveCfg } from "./platform/storage.js";
import { idbSf2Put } from "./platform/storage.js";
import { idbAudioPut } from "./platform/storage.js";
import { idbAudioMove } from "./platform/storage.js";
import { idbSf2Get } from "./platform/storage.js";
import { CONSOLE_OF } from "./platform/storage.js";
import { draftInIdb } from "./platform/storage.js";
import { idbDraftOp } from "./platform/storage.js";
import { idbOpen } from "./platform/storage.js";
import { analysisURL } from "./platform/storage.js";
import { idbFsPut } from "./platform/storage.js";
import { idbFsGet } from "./platform/storage.js";
import { idbAudioDelete } from "./platform/storage.js";
import { IMP_DIR } from "./platform/storage.js";
import { idbNsfPutNow } from "./platform/storage.js";
import { baseJoin } from "./platform/storage.js";
import { readBase } from "./platform/storage.js";
import { folderOnly } from "./platform/folder.js";
import { readData } from "./platform/folder.js";
import { nativeFs } from "./platform/folder.js";
import { folderActive } from "./platform/folder.js";
import { fsRoot } from "./platform/folder.js";
import { bundledPath } from "./platform/folder.js";
import { folderWrite } from "./platform/folder.js";
import { folderDelete } from "./platform/folder.js";
import { fsDirFor } from "./platform/folder.js";
import { folderRead } from "./platform/folder.js";
import { nativeDirHandle } from "./platform/folder.js";
import { fsReadJSON } from "./platform/folder.js";
import { folderSupported } from "./platform/folder.js";
import { folderPermission } from "./platform/folder.js";
import { restoreFolder } from "./platform/folder.js";
import { updateTrackGains } from "./audio/engine.js";
import { trackVol } from "./audio/engine.js";
import { trackPan } from "./audio/engine.js";
import { MASTER_VOL } from "./audio/engine.js";
import { trackGain } from "./audio/engine.js";
import { trackAudible } from "./audio/engine.js";
import { pieceState } from "./audio/engine.js";
import { pieceAudible } from "./audio/engine.js";
import { gestureActive } from "./audio/engine.js";
import { warmContext } from "./audio/engine.js";
import { clockAlive } from "./audio/engine.js";
import { clockProbeText } from "./audio/engine.js";
import { openMaster } from "./audio/engine.js";
import { drumHit } from "./audio/engine.js";
import { pluckBuffer } from "./audio/engine.js";
import { makeOsc } from "./audio/engine.js";
import { dutyWave } from "./audio/engine.js";
import { drumNoise } from "./audio/engine.js";
import { drumNoiseBuf } from "./audio/engine.js";
import { DRUM_LONG_SEC } from "./audio/engine.js";
import { DRUM_SUSTAIN_CAP_SEC } from "./audio/engine.js";
import { sfFileFor } from "./audio/voices.js";
import { trackVoice } from "./audio/voices.js";
import { sfDecode } from "./audio/voices.js";
import { sfBank } from "./audio/voices.js";
import { VOICES } from "./audio/voices.js";
import { voiceType } from "./audio/voices.js";
import { parseGameVoice } from "./audio/voices.js";
import { gameVoiceVault } from "./audio/voices.js";
import { parseSf2Voice } from "./audio/voices.js";
import { VOICE_GROUPS } from "./audio/voices.js";
import { gameVoiceId } from "./audio/voices.js";
import { sf2VoiceId } from "./audio/voices.js";
import { playSynthVoice } from "./audio/voices.js";
import { SF_VOICES } from "./audio/voices.js";
import { sfPick } from "./audio/voices.js";
import { VOICE_AMP } from "./audio/voices.js";
import { SF_NOTE_NAMES } from "./audio/voices.js";
import { sfNoteName } from "./audio/voices.js";
import { sfEnsure } from "./audio/voices.js";
import { sfDecodeCtx } from "./audio/voices.js";
import { currentLoop } from "./audio/transport.js";
import { albumEndSec } from "./audio/transport.js";
import { ALBUM_FADE } from "./audio/transport.js";
import { audioStopSrcs } from "./audio/transport.js";
import { ALBUM_PASSES } from "./audio/transport.js";
import { albumNextIdx } from "./audio/transport.js";
import { albumPrevIdx } from "./audio/transport.js";
import { ALBUM_MAX_FAILS } from "./audio/transport.js";
import { ALBUM_CAP_SEC } from "./audio/transport.js";
import { playSec } from "./audio/transport.js";
import { albumMetaFor } from "./model/provenance.js";
import { chipActive } from "./audio/chip.js";
import { chipHas } from "./audio/chip.js";
import { chip } from "./audio/chip.js";
import { chipPreviewBuffer } from "./audio/chip.js";
import { chipTrackNo } from "./audio/chip.js";
import { vaultFetch } from "./audio/chip.js";
import { chipAlbumHasSource } from "./audio/chip.js";
import { chipStopSrcs } from "./audio/chip.js";
import { chipPreviewCache } from "./audio/chip.js";
import { chipRenderBudget } from "./audio/chip.js";
import { chipWorkerAvailable } from "./audio/chip.js";
import { planChipRender } from "./audio/chip.js";
import { chipRenderStreamed } from "./audio/chip.js";
import { chipIsPcm } from "./audio/chip.js";
import { chipSilent } from "./audio/chip.js";
import { chipStaticPan } from "./audio/chip.js";
import { chipDownmixStatic } from "./audio/chip.js";
import { chipPreviewProgAt } from "./audio/chip.js";
import { chipPcmToBuffers } from "./audio/chip.js";
import { chipPreviewPending } from "./audio/chip.js";
import { chipBuffers } from "./audio/chip.js";
import { chipStart } from "./audio/chip.js";
import { ghHeaders } from "./audio/chip.js";
import { albumMetaCache } from "./model/provenance.js";
import { CHIP_BUDGET_APP } from "./audio/chip.js";
import { CHIP_BUDGET_WEB } from "./audio/chip.js";
import { CHIP_RATE_STEPS } from "./audio/chip.js";
import { CHIP_STREAMED_RENDER_CHUNK_SEC } from "./audio/chip.js";
import { chipNoteSlice } from "./audio/chip-stream.js";
import { chipStreamOnChunk } from "./audio/chip-stream.js";
import { chipStreamOnSilent } from "./audio/chip-stream.js";
import { CHIP_STREAM_CHUNK_SEC } from "./audio/chip-stream.js";
import { CHIP_STREAM_OVERLAP } from "./audio/chip-stream.js";
import { chipAutoShouldStream } from "./audio/chip-stream.js";
import { chipAutoReason } from "./audio/chip-stream.js";
import { chipStreamIdxForTapeSec } from "./audio/chip-stream.js";
import { chipStreamRequestRange } from "./audio/chip-stream.js";
import { chipStreamWaitFor } from "./audio/chip-stream.js";
import { chipStreamMode } from "./audio/chip-stream.js";
import { chipStreamStart } from "./audio/chip-stream.js";
import { chipStreamPump } from "./audio/chip-stream.js";
import { CHIP_STREAM_HORIZON_VISIBLE } from "./audio/chip-stream.js";
import { CHIP_STREAM_HORIZON_HIDDEN } from "./audio/chip-stream.js";
import { CHIP_STREAM_PIN_LOOKAHEAD } from "./audio/chip-stream.js";
import { CHIP_SEG_HORIZON_SEC } from "./audio/chip-stream.js";
import { CHIP_SEG_MAX_SEGMENTS } from "./audio/chip-stream.js";
import { chipSegments } from "./audio/chip-stream.js";
import { chipStreamPinLoopStart } from "./audio/chip-stream.js";
import { chipStreamEvict } from "./audio/chip-stream.js";
import { chipStreamScheduled } from "./audio/chip-stream.js";
import { chipStreamScheduleChunk } from "./audio/chip-stream.js";
import { clipEndTick } from "./model/song.js";
import { songHasAudio } from "./model/song.js";
import { stretchCache } from "./audio/clips.js";
import { clipLen } from "./model/song.js";
import { forEachClip } from "./audio/clips.js";
import { stretchPending } from "./audio/clips.js";
import { clipOnsetSec } from "./audio/clips.js";
import { clipTempo } from "./audio/clips.js";
import { clipBeatMap } from "./audio/clips.js";
import { keepPitch } from "./audio/clips.js";
import { audioBufCache } from "./audio/clips.js";
import { audioCacheKey } from "./audio/clips.js";
import { audioBytesFor } from "./audio/clips.js";
import { decodeAudioBytes } from "./audio/clips.js";
import { stretchKey } from "./audio/clips.js";
import { stretchInWorker } from "./audio/clips.js";
import { clipClamp } from "./audio/clips.js";
import { audioReady } from "./audio/clips.js";
import { audioDirFor } from "./audio/clips.js";
import { PEAK_BUCKET } from "./audio/clips.js";
import { peaksOf } from "./audio/clips.js";
import { tempoFromPeaks } from "./audio/clips.js";
import { onsetCurve } from "./audio/clips.js";
import { beatTrack } from "./audio/clips.js";
import { wsolaStretch } from "./audio/clips.js";
import { stretchJobs } from "./audio/clips.js";
import { met } from "./audio/metronome.js";
import { ensureMetGain } from "./audio/metronome.js";
import { metClick } from "./audio/metronome.js";
import { metPump } from "./audio/metronome.js";
import { metBuildCells } from "./audio/metronome.js";
import { applyMetMode } from "./audio/metronome.js";
import { metHalt } from "./audio/metronome.js";
import { metSave } from "./audio/metronome.js";
import { metDefaultAccents } from "./audio/metronome.js";
import { metFollowNum } from "./audio/metronome.js";
import { metFollowBeatTicks } from "./audio/metronome.js";
import { metPumpFollow } from "./audio/metronome.js";
import { midiBase64 } from "./audio/bounce.js";
import { audioBufferToWav } from "./audio/bounce.js";
import { deliverAudioFile } from "./audio/bounce.js";
import { wavEncode } from "./audio/bounce.js";
import { isUnsaved } from "./model/provenance.js";
import { isComposition } from "./model/provenance.js";
import { ownFolderPath } from "./model/provenance.js";
import { originOf } from "./model/provenance.js";
import { bakesTempo } from "./model/provenance.js";
import { canEditMusic } from "./model/provenance.js";
import { isCaptureKey } from "./model/provenance.js";
import { slugify } from "./model/provenance.js";
import { folderFromInput } from "./model/provenance.js";
import { albumTitleFor } from "./model/provenance.js";
import { bakesMeter } from "./model/provenance.js";
import { untitledKey } from "./model/provenance.js";
import { setOrigin } from "./model/provenance.js";
import { NR_DIR } from "./model/provenance.js";
import { chosenFolder } from "./model/provenance.js";
import { isCompositionKey } from "./model/provenance.js";
import { originFor } from "./model/provenance.js";
import { COMP_DIR } from "./model/provenance.js";
import { PROVENANCE_RE } from "./model/provenance.js";
import { READONLY_DIRS } from "./model/provenance.js";
import { hasProvenanceNote } from "./model/provenance.js";
import { pendingOriginKey } from "./model/provenance.js";
import { pendingOrigin } from "./model/provenance.js";
import { RULES } from "./model/provenance.js";
import { rulesFor } from "./model/provenance.js";
import { COMP_ALBUMS } from "./model/provenance.js";
import { RESERVED_FOLDERS } from "./model/provenance.js";
import { editableSong } from "./model/song.js";
import { selEditItems } from "./model/selection.js";
import { clipboardHas } from "./model/selection.js";
import { clipSummary } from "./model/selection.js";
import { albumEffectiveOrder } from "./model/album-order.js";
import { albumHasTrackData } from "./model/album-order.js";
import { albumOrderControl } from "./model/album-order.js";
import { setAlbumOrderPref } from "./model/album-order.js";
import { slugOfPath } from "./model/album-order.js";
import { albumTrackMap } from "./model/album-order.js";
import { albumOrder } from "./model/album-order.js";
import { songUnsaved } from "./model/versions.js";
import { draftKeys } from "./model/versions.js";
import { migrateVersions } from "./model/versions.js";
import { musicSig } from "./model/versions.js";
import { draftTracks } from "./model/versions.js";
import { draftDoc } from "./model/versions.js";
import { readVersions } from "./model/versions.js";
import { pushVersion } from "./model/versions.js";
import { songDirtyFlag } from "./model/versions.js";
import { autosaveOn } from "./model/versions.js";
import { versionsStoreKey } from "./model/versions.js";
import { readVersionsRaw } from "./model/versions.js";
import { writeVersionsRaw } from "./model/versions.js";
import { jobListeners } from "./model/jobs.js";
import { jobsSave } from "./model/jobs.js";
import { JOBS_AUTOCLEAR_MS } from "./model/jobs.js";
import { jobControls } from "./model/jobs.js";
import { JOB_KINDS } from "./model/jobs.js";
import { jobBarSet } from "./model/jobs.js";
import { jobFraction } from "./model/jobs.js";
import { jobProgress } from "./model/jobs.js";
import { jobsOnChange } from "./model/jobs.js";
import { logLines } from "./model/jobs.js";
import { logPush } from "./model/jobs.js";
import { appErrors } from "./model/jobs.js";
import { appDebug } from "./model/jobs.js";
import { debugLogOn } from "./model/jobs.js";
import { BENIGN_ERRORS } from "./model/jobs.js";
import { logLine } from "./model/jobs.js";
import { jobsFind } from "./model/jobs.js";
import { jobsList } from "./model/jobs.js";
import { importHubLabel } from "./import/hub.js";
import { impDisplayTitle } from "./import/capture.js";
import { sf2Magic } from "./import/capture.js";
import { audioMagic } from "./import/capture.js";
import { streamedAudioMagic } from "./import/capture.js";
import { importDraftKeys } from "./import/capture.js";
import { impDirFor } from "./import/capture.js";
import { impTrackLabel } from "./import/capture.js";
import { impTrackKey } from "./import/capture.js";
import { connected } from "./sync/publish.js";
import { writeToken } from "./sync/publish.js";
import { putMidAt } from "./sync/publish.js";
import { declaredTsForKey } from "./model/rollnotes.js";
import { putRollnotes } from "./sync/publish.js";
import { putSongsText } from "./sync/publish.js";
import { notesTxtFor } from "./model/rollnotes.js";
import { uploadAudioClipsFor } from "./sync/publish.js";
import { audioDirFiles } from "./sync/publish.js";
import { deleteRepoFile } from "./sync/publish.js";
import { writeSongsReadme } from "./sync/publish.js";
import { takeToken } from "./sync/publish.js";
import { shareLinkFor } from "./sync/publish.js";
import { recordLastSync } from "./sync/publish.js";
import { uploadAudioClips } from "./sync/publish.js";
import { APP_REPO } from "./sync/publish.js";
import { PUBLIC_BASE } from "./sync/publish.js";
import { publicBase } from "./sync/publish.js";
import { README_OPEN } from "./sync/publish.js";
import { README_CLOSE } from "./sync/publish.js";
import { songsReadmeBlock } from "./sync/publish.js";
import { spliceReadme } from "./sync/publish.js";
import { estimateKey } from "./model/song.js";
import { checkKeyVsFile } from "./model/song.js";
import { KS_MAJOR_PROFILE } from "./model/song.js";
import { KS_MINOR_PROFILE } from "./model/song.js";
import { keyEstimateSig } from "./model/song.js";
import { tonicPcFromName } from "./model/song.js";
import { initCatalog } from "./model/catalog.js";
import { folderScanAlbums } from "./model/catalog.js";
import { tonicPcOfName } from "./theory/key.js";
import { modeOfName } from "./theory/key.js";
import { keyNameAt } from "./model/song.js";
import { sfShownAt } from "./model/song.js";
import { sfDeclaredAt } from "./model/song.js";
import { sfAt } from "./model/song.js";
import { sfDeclaredAtRaw } from "./model/song.js";
import { fmtBarBeat } from "./gen/drummer.js";
import { drNormParts } from "./gen/drummer.js";
import { drBassTrack } from "./gen/drummer.js";
import { drBoundaries } from "./gen/drummer.js";
import { sectionLane } from "./gen/drummer.js";
import { drumRng } from "./gen/drummer.js";
import { DR_FILLS } from "./gen/drummer.js";
import { drBackbeats } from "./gen/drummer.js";
import { fnv1a32 } from "./gen/drummer.js";
import { DR_TOMS } from "./gen/drummer.js";
import { bsInferTimeline } from "./gen/bassist.js";
import { bsChordTimeline } from "./gen/bassist.js";
import { chordAt } from "./gen/bassist.js";
import { nextChange } from "./gen/bassist.js";
import { bsChordTone } from "./gen/bassist.js";
import { computeAnalysisLayer } from "./gen/analysis.js";
import { harmonyTrackIndices } from "./gen/analysis.js";
import { RULER_W_ROLL } from "./render/roll.js";
import { BASE_RULER_H } from "./render/roll.js";
import { STRIP_H } from "./render/roll.js";
import { TRACK_COLORS } from "./render/roll.js";
import { LANE_H } from "./render/roll.js";
import { AUDIO_STRIP_H } from "./render/roll.js";
import { isDirective } from "./model/rollnotes.js";
import { curTick } from "./render/roll.js";
import { activeNoteAt } from "./render/roll.js";
import { sectionPathAt } from "./render/roll.js";
import { rangeSelRestore } from "./render/roll.js";
import { trackColor } from "./render/roll.js";
import { canvas } from "./render/roll.js";
import { wrap } from "./render/roll.js";
import { ctx } from "./render/roll.js";
import { drawRangeTints } from "./render/roll.js";
import { rangeSelPersist } from "./render/roll.js";
import { viewPersistSoon } from "./render/roll.js";
import { fallActive } from "./render/roll.js";
import { pxPerTick } from "./render/roll.js";
import { css } from "./render/roll.js";
import { drawStripPlayhead } from "./render/roll.js";
import { drawRuler } from "./render/roll.js";
import { stripPlayheadX } from "./render/roll.js";
import { topRow } from "./render/roll.js";
import { botRow } from "./render/roll.js";
import { inKitLane } from "./render/roll.js";
import { kitLaneTop } from "./render/roll.js";
import { trackShown } from "./render/roll.js";
import { noteRow } from "./render/roll.js";
import { showAddedOutline } from "./render/roll.js";
import { drawLasso } from "./render/roll.js";
import { laneBotRow } from "./render/roll.js";
import { kitSlots } from "./render/roll.js";
import { DRUM_LABELS } from "./render/roll.js";
import { drumStep } from "./hooks.js";
import { annoInLasso } from "./hooks.js";
import { songHasDrums } from "./render/roll.js";
import { viewRestore } from "./render/roll.js";
import { TRACKS_GUTTER } from "./render/roll.js";
import { setAddedOutline } from "./render/roll.js";
import { DRUM_SLOTS } from "./render/roll.js";
import { computeLaneTop } from "./render/roll.js";
import { AUTO_COLOR_S } from "./render/roll.js";
import { AUTO_COLOR_L } from "./render/roll.js";
import { hslToHex } from "./render/roll.js";
import { hueOf } from "./render/roll.js";
import { hueDist } from "./render/roll.js";
import { relLuminance } from "./render/roll.js";
import { contrastRatio } from "./render/roll.js";
import { ROLL_SURFACE_COLORS } from "./render/roll.js";
import { TRACK_COLOR_CANDIDATES } from "./render/roll.js";
import { pickFarthestColor } from "./render/roll.js";
import { autoTrackColors } from "./render/roll.js";
import { cssCache } from "./render/roll.js";
import { viewKey } from "./render/roll.js";
import { rangeSelKey } from "./render/roll.js";
import { drawPlayheadStripBand } from "./render/roll.js";
import { isCopyableAnno } from "./model/rollnotes.js";
import { drawAnalysisLayer } from "./render/roll.js";
import { drawTracks } from "./render/tracks.js";
import { trackLaneAt } from "./render/tracks.js";
import { laneGeom } from "./render/tracks.js";
import { tracksNoteY } from "./render/tracks.js";
import { clipLabel } from "./render/tracks.js";
import { clipSpanX } from "./render/tracks.js";
import { selClipIs } from "./render/tracks.js";
import { tracksLaneH } from "./render/tracks.js";
import { fmtSec } from "./render/tracks.js";
import { clipStatusText } from "./render/tracks.js";
import { selClipObj } from "./render/tracks.js";
import { drawAudioStrip } from "./render/tracks.js";
import { drawClipLane } from "./render/tracks.js";
import { buildScoreModel } from "./hooks.js";
import { scoreTickToX } from "./render/score.js";
import { VF } from "./render/score.js";
import { drawScore } from "./render/score.js";
import { SCORE_PAD } from "./render/score.js";
import { renderMeasure } from "./render/score.js";
import { SCORE_INTRO_W } from "./render/score.js";
import { scoreContentH } from "./render/score.js";
import { scoreXToTick } from "./render/score.js";
import { SCORE_TOP } from "./render/score.js";
import { STAVE_H } from "./render/score.js";
import { DRUM_SCORE } from "./render/score.js";
import { drumScoreRole } from "./render/score.js";
import { vexKey } from "./render/score.js";
import { durationPieces } from "./render/score.js";
import { renderIntro } from "./render/score.js";
import { scoreMeasureAnchors } from "./render/score.js";
import { drawScorePencilGuides } from "./render/score.js";
import { drawInst } from "./render/instrument.js";
import { drawFall } from "./render/instrument.js";
import { FALL_WINDOW } from "./render/instrument.js";
import { instGeom } from "./render/instrument.js";
import { pianoHit } from "./render/instrument.js";
import { instScrollBy } from "./render/instrument.js";
import { instOctave } from "./render/instrument.js";
import { instRevealPitch } from "./render/instrument.js";
import { INST_CHEVRON_W } from "./render/instrument.js";
import { PIANO_LO, PIANO_HI, pianoIsWhite } from "./ui/piano.js";
import { applyInstBar } from "./ui/chrome.js";
import { degreeOf } from "./render/instrument.js";
import { drawPiano } from "./render/instrument.js";
import { drawGuitar } from "./render/instrument.js";
import { guitarGeom } from "./render/instrument.js";
import { GTR_FRETS } from "./render/instrument.js";
import { GTR_TUNING } from "./render/instrument.js";
import { instCanvas } from "./render/instrument.js";
import { instWrap } from "./render/instrument.js";
import { GTR_NAMES } from "./render/instrument.js";
import { instResize } from "./render/instrument.js";
import { ictx } from "./render/instrument.js";
import { DEGREE_LABEL } from "./render/instrument.js";
import { instRange } from "./render/instrument.js";
import { instLitPitches } from "./render/instrument.js";
import { instLitColor } from "./render/instrument.js";
import { gtrFold } from "./render/instrument.js";
import { wrapSf } from "./render/cof.js";
import { drawCof } from "./render/cof.js";
import { cofCanvas } from "./render/cof.js";
import { cofCtx } from "./render/cof.js";
import { cofMinor } from "./render/cof.js";
import { cofDim } from "./render/cof.js";
import { cofSigLabel } from "./render/cof.js";
import { cofMajorName } from "./render/cof.js";
import { drawCompare } from "./render/compare.js";
import { cmpDiff } from "./render/compare.js";
import { cmpTrackKey } from "./render/compare.js";
import { posToTickPitch } from "./input/gestures.js";
import { evtPos } from "./input/gestures.js";
import { armNoteEdit } from "./input/gestures.js";
import { cursorHit } from "./input/gestures.js";
import { rulerSnapX } from "./input/gestures.js";
import { tickAtX } from "./input/gestures.js";
import { recOpenEnded } from "./model/song.js";
import { recSnap } from "./input/record.js";
import { recSnapOn } from "./input/record.js";
import { midiStatusLine } from "./input/record.js";
import { songTitleOf } from "./hooks.js";
import { songWhereLabel } from "./ask/context.js";
import { aiHostKind } from "./ask/backend.js";
import { aiRunTest } from "./ask/backend.js";
import { aiBackendRows } from "./ask/backend.js";
import { aiUrl } from "./ask/backend.js";
import { aiHeaders } from "./ask/backend.js";
import { AI_BROWSER_MODELS } from "./ask/backend.js";
import { aiProvider } from "./ask/backend.js";
import { aiBrowserMenu } from "./ask/backend.js";
import { aiModelMenu } from "./ask/backend.js";
import { aiSay } from "./ask/backend.js";
import { aiSSE } from "./ask/backend.js";
import { aiRemote } from "./ask/backend.js";
import { aiPickModel } from "./ask/backend.js";
import { AI_TEST_MS } from "./ask/backend.js";
import { aiTest } from "./ask/backend.js";
import { AI_WEBLLM_URL } from "./ask/backend.js";
import { aiWebllmLoad } from "./ask/backend.js";
import { aiEngineFor } from "./ask/backend.js";
import { aiBrowserTest } from "./ask/backend.js";
import { aiBrowser } from "./ask/backend.js";
import { askKeySpellComment } from "./ask/context.js";
import { askBarRow } from "./ask/context.js";
import { askSpanNotesCompact } from "./ask/context.js";
import { askAppState } from "./ask/context.js";
import { askOpenSongLine } from "./ask/context.js";
import { askNewSinceLines } from "./ask/context.js";
import { askViewCursorLine } from "./ask/context.js";
import { askModeLine } from "./ask/context.js";
import { askSentGet } from "./ask/context.js";
import { askLegendText } from "./ask/context.js";
import { askSentStage } from "./ask/context.js";
import { ASK_CPT } from "./ask/context.js";
import { askCachedBlock } from "./ask/context.js";
import { askSpanCachedBlock } from "./ask/context.js";
import { askStripContext } from "./ask/context.js";
import { askSentReset } from "./ask/context.js";
import { askMsgMode } from "./ask/context.js";
import { askSpan } from "./ask/context.js";
import { askSpanLabel } from "./ask/context.js";
import { askSentCommit } from "./ask/context.js";
import { askSentDrop } from "./ask/context.js";
import { askBudget } from "./ask/context.js";
import { askEstimate } from "./ask/context.js";
import { askSys } from "./ask/context.js";
import { askTerminalContext } from "./ask/context.js";
import { askBuildMessages } from "./ask/context.js";
import { ASK_SYS_BASE1 } from "./ask/context.js";
import { RULE_LEARNING } from "./ask/context.js";
import { RULE_NORMAL } from "./ask/context.js";
import { ASK_SYS_BASE2 } from "./ask/context.js";
import { askKeyDeclared } from "./ask/context.js";
import { askSpanNotes } from "./ask/context.js";
import { askBarFingerprint } from "./ask/context.js";
import { askSpanNotesCompactCached } from "./ask/context.js";
import { askCapLines } from "./ask/context.js";
import { askSentKey } from "./ask/context.js";
import { askSentStageBars } from "./ask/context.js";
import { ASK_SENT_BARS_CAP } from "./ask/context.js";
import { askEpochKey } from "./ask/context.js";
import { askEpochGet } from "./ask/context.js";
import { askEpochSet } from "./ask/context.js";
import { askEpochNote } from "./ask/context.js";
import { askFindAnnotation } from "./ask/tools.js";
import { askAnnotationStructural } from "./ask/tools.js";
import { askNoteKind } from "./ask/tools.js";
import { askSongPath } from "./ask/tools.js";
import { notesTxtForDoc } from "./ask/tools.js";
import { askReadBars } from "./ask/tools.js";
import { askAnnotationsTextCompact } from "./ask/tools.js";
import { askAnnotationsText } from "./ask/tools.js";
import { ASK_TOOLS } from "./ask/tools.js";
import { askWritableGate } from "./ask/tools.js";
import { askFindTrackIndex } from "./ask/tools.js";
import { askWriteNotesValidate } from "./ask/tools.js";
import { askBarsValidate } from "./ask/tools.js";
import { askBarsCount } from "./ask/tools.js";
import { askNoteValue } from "./ask/tools.js";
import { ASK_READ_BARS_MAX } from "./ask/tools.js";
import { askNormChip } from "./ask/tools.js";
import { parsePitch } from "./ask/tools.js";
import { askNoteVel } from "./ask/tools.js";
import { askSeenMax } from "./ask/bridge.js";
import { askUnsavedCount } from "./ask/bridge.js";
import { askRevertToSaved } from "./ask/bridge.js";
import { askTermModelsLoad } from "./ask/bridge.js";
import { askStatusRender } from "./ask/bridge.js";
import { ASK_TERMINAL_KEY } from "./ask/bridge.js";
import { ASK_GENERAL_KEY } from "./ask/bridge.js";
import { askStore } from "./ask/bridge.js";
import { ASK_LOCAL_SOFT } from "./ask/bridge.js";
import { askEvictOthers } from "./ask/bridge.js";
import { askLogKey } from "./ask/bridge.js";
import { askLogSong } from "./ask/bridge.js";
import { askLogPath } from "./ask/bridge.js";
import { askLogMarkdown } from "./ask/bridge.js";
import { askLogHeader } from "./ask/bridge.js";
import { askInboxAllowed } from "./ask/bridge.js";
import { askInboxSeenKey } from "./ask/bridge.js";
import { deployButtonTick } from "./ask/bridge.js";
import { askSessionRender } from "./ask/bridge.js";
import { askSessionRefresh } from "./ask/bridge.js";
import { askTabsVisible } from "./ask/bridge.js";
import { askSessionName } from "./ask/bridge.js";
import { askSessionLine } from "./ask/bridge.js";
import { askCompactModelName } from "./ask/bridge.js";
import { askComposing } from "./ask/bridge.js";
import { askSeenCommit } from "./ask/bridge.js";
import { askPendingIndex } from "./ask/bridge.js";
import { askModelName } from "./ask/bridge.js";
import { askSeenDrop } from "./ask/bridge.js";
import { askJobsSupported } from "./ask/bridge.js";
import { askToolsNow } from "./ask/bridge.js";
import { askLoad } from "./ask/bridge.js";
import { askJobId } from "./ask/bridge.js";
import { askPendingAll } from "./ask/bridge.js";
import { askBadgeOff } from "./ask/bridge.js";
import { deployActive } from "./ask/bridge.js";
import { askStatusToggle } from "./ask/bridge.js";
import { ASK_GENERAL_LOG } from "./ask/bridge.js";
import { ASK_TOTAL_CAP } from "./ask/bridge.js";
import { askSeenKey } from "./ask/bridge.js";
import { askSeenGet } from "./ask/bridge.js";
import { askMaxErrId } from "./ask/bridge.js";
import { askMaxStatusId } from "./ask/bridge.js";
import { askSeenMaxKey } from "./ask/bridge.js";
import { askSeenSet } from "./ask/bridge.js";
import { askSeenAdvance } from "./ask/bridge.js";
import { askSeenStage } from "./ask/bridge.js";
import { ASK_SONG_ONLY_TOOLS } from "./ask/bridge.js";
import { askAgeText } from "./ask/bridge.js";
import { deployBannerShow } from "./ask/bridge.js";
import { askStatusIdle } from "./ask/bridge.js";
import { askStatusLine } from "./ask/bridge.js";
import { askStatusRecentShow } from "./ask/bridge.js";
import { askStatusFetchCommits } from "./ask/bridge.js";
import { TERM_MODELS } from "./ask/bridge.js";
import { askModeButtons } from "./ask/sheet.js";
import { asksheet } from "./ask/sheet.js";
import { askStoreKey } from "./ask/sheet.js";
import { askstatus } from "./ask/sheet.js";
import { askClock } from "./ask/sheet.js";
import { askNoteLabel } from "./ask/sheet.js";
import { askSetMode } from "./ask/sheet.js";
import { askDraftSaveSoon } from "./ask/sheet.js";
import { asklog } from "./ask/sheet.js";
import { askDraftSave } from "./ask/sheet.js";
import { askDraftLoad } from "./ask/sheet.js";
import { askPartial } from "./ask/sheet.js";
import { askScrollEnd } from "./ask/sheet.js";
import { askShowThinking } from "./ask/sheet.js";
import { askinput } from "./ask/sheet.js";
import { askDraftClear } from "./ask/sheet.js";
import { askGrow } from "./ask/sheet.js";
import { askRefresh } from "./ask/sheet.js";
import { askFocusIfKeyboard } from "./ask/sheet.js";
import { askDraftStore } from "./ask/sheet.js";
import { b64Bytes } from "./ask/shots.js";
import { ASKSHOT_MAX } from "./ask/shots.js";
import { askShotUpload } from "./ask/shots.js";
import { askShotAdd } from "./ask/shots.js";
import { askShotStatusLabel } from "./ask/shots.js";
import { askShotClearAll } from "./ask/shots.js";
import { askPickFiles } from "./ask/shots.js";
import { askShotDisplayText } from "./ask/shots.js";
import { askShotOutgoing } from "./ask/shots.js";
import { askShotLine } from "./ask/shots.js";
import { askShotRender } from "./ask/shots.js";
import { askShotRemove } from "./ask/shots.js";
import { askShotRestore } from "./ask/shots.js";
import { MAX_SHOT_SIDE } from "./ask/shots.js";
import { MAX_SHOT_KEEP_BYTES } from "./ask/shots.js";
import { askPrepImage } from "./ask/shots.js";
import { updateTrackMore } from "./ui/trackbar.js";
import { fitTrackRow } from "./ui/trackbar.js";
import { scheduleFitTrackRow } from "./ui/trackbar.js";
import { TRACK_ROW_SLACK } from "./ui/trackbar.js";
import { trackRowNeed } from "./ui/trackbar.js";
import { moveInSameOrder } from "./ui/mixer.js";
import { mixerMasterStripEl } from "./ui/mixer.js";
import { mixerPanLabel } from "./ui/mixer.js";
import { ensureMixerMeters } from "./ui/mixer.js";
import { ensureMixerMeterLoop } from "./ui/mixer.js";
import { teardownMixerMeters } from "./ui/mixer.js";
import { mixerIsOpen } from "./ui/mixer.js";
import { mixerMeterRms } from "./ui/mixer.js";
import { mixerMeterLoop } from "./ui/mixer.js";
import { setInfo } from "./hooks.js";
import { renderViewMenu } from "./ui/chrome.js";
import { logDebug } from "./hooks.js";
import { keyLabelState } from "./ui/chrome.js";
import { updateSyncBtn } from "./hooks.js";
import { updateSongBtn } from "./hooks.js";
import { appConfirm } from "./hooks.js";
import { updateJobsBtn } from "./hooks.js";
import { logErr } from "./hooks.js";
import { srAnnounce } from "./hooks.js";
import { songHeader } from "./ui/chrome.js";
import { localLabel } from "./ui/chrome.js";
import { songRow } from "./ui/chrome.js";
import { closeDropUp } from "./ui/chrome.js";
import { findsel } from "./ui/chrome.js";
import { refreshFindSel } from "./ui/chrome.js";
import { scheduleFitReadline } from "./ui/chrome.js";
import { fitReadline } from "./ui/chrome.js";
import { applyChrome } from "./ui/chrome.js";
import { renderViewSwitch } from "./ui/chrome.js";
import { viewbtn } from "./ui/chrome.js";
import { viewSwitchMenu } from "./ui/chrome.js";
import { applyInst } from "./ui/chrome.js";
import { instbtn } from "./ui/chrome.js";
import { subbtn } from "./ui/chrome.js";
import { instFallBtn } from "./ui/chrome.js";
import { micStop } from "./ui/chrome.js";
import { errChip } from "./ui/chrome.js";
import { STATUS_HISTORY_CAP } from "./ui/chrome.js";
import { expandKeyName } from "./ui/chrome.js";
import { FOOTER_DROPUP_BTN_IDS } from "./ui/chrome.js";
import { viewSaved } from "./ui/chrome.js";
import { keyNameShownAt } from "./ui/chrome.js";
import { nmic } from "./ui/chrome.js";
import { pendingSongs } from "./ui/chrome.js";
import { songtitleEl } from "./ui/chrome.js";
import { dirtySongs } from "./ui/chrome.js";
import { syncable } from "./ui/chrome.js";
import { draftDirtyState } from "./ui/chrome.js";
import { GAME_FAMILY } from "./ui/voice-menu.js";
import { SF2_FAMILY } from "./ui/voice-menu.js";
import { autoVoiceLabel } from "./ui/voice-menu.js";
import { gameVoiceFromSet } from "./ui/voice-menu.js";
import { gameVoiceFrom } from "./ui/voice-menu.js";
import { gameVoiceFromAll } from "./ui/voice-menu.js";
import { refreshKeysetLabel } from "./ui/notes.js";
import { keysel } from "./ui/notes.js";
import { tonicLabel } from "./ui/notes.js";
import { chosenTonicPc } from "./ui/notes.js";
import { keymodeSel } from "./ui/notes.js";
import { keysetBtn } from "./ui/notes.js";
import { chosenTonic } from "./ui/notes.js";
import { partialNameOf } from "./ui/notes.js";
import { NOTE_GROUPS } from "./ui/notes.js";
import { notelistSheet } from "./ui/notes.js";
import { runKeyCheck } from "./ui/notes.js";
import { runMeterCheck } from "./ui/notes.js";
import { useFileMeter } from "./ui/notes.js";
import { renderNoteJump } from "./ui/notes.js";
import { showHelpTab } from "./ui/notes.js";
import { lassobtn } from "./ui/notes.js";
import { openChallenge } from "./ui/notes.js";
import { tonicOptionValue } from "./ui/notes.js";
import { fileCheckLine } from "./ui/notes.js";
import { chordEvidence } from "./ui/notes.js";
import { snapBeat } from "./model/grid.js";
import { openEditor } from "./ui/note-editor.js";
import { updateEditButtons } from "./ui/note-editor.js";
import { CHORD_QUALS } from "./ui/note-editor.js";
import { stampChordBand } from "./ui/note-editor.js";
import { chordLabel } from "./ui/note-editor.js";
import { CHORD_ROOTS } from "./ui/note-editor.js";
import { INS_DURS } from "./ui/note-editor.js";
import { PROG_LIB } from "./ui/note-editor.js";
import { applyEditorType } from "./ui/note-editor.js";
import { BASS_SPELLINGS } from "./ui/note-editor.js";
import { chordSel } from "./ui/note-editor.js";
import { refreshChordChips } from "./ui/note-editor.js";
import { composeChord } from "./ui/note-editor.js";
import { micToggle } from "./ui/note-editor.js";
import { editor } from "./ui/note-editor.js";
import { editorType } from "./ui/note-editor.js";
import { getBeatPair } from "./ui/note-editor.js";
import { setBeatPair } from "./ui/note-editor.js";
import { SPEECH } from "./ui/note-editor.js";
import { fillBarBeatSelects } from "./ui/note-editor.js";
import { setChordWidget } from "./ui/note-editor.js";
import { micJoin } from "./ui/note-editor.js";
import { setAnchorBQ } from "./hooks.js";
import { setEndBQ } from "./model/rollnotes.js";
import { lassoedAnnos } from "./hooks.js";
import { dropSupersededBy } from "./model/rollnotes.js";
import { renderJobs } from "./ui/sheets.js";
import { jobCancel } from "./ui/sheets.js";
import { renderPubJob } from "./ui/sheets.js";
import { openAnalyzeSheet } from "./ui/sheets.js";
import { publishDest } from "./ui/sheets.js";
import { publishLabel } from "./ui/sheets.js";
import { openPubJobSheet } from "./ui/sheets.js";
import { openSettingsSheet } from "./ui/sheets.js";
import { openShareSheet } from "./ui/sheets.js";
import { versionLabel } from "./ui/sheets.js";
import { jobsDismiss } from "./ui/sheets.js";
import { jobApi } from "./ui/sheets.js";
import { askCopyText } from "./ui/sheets.js";
import { penInstant } from "./ui/sheets.js";
import { noteTapMovesCursor } from "./ui/sheets.js";
import { dropLocalSong } from "./ui/sheets.js";
import { pubCheck } from "./ui/sheets.js";
import { cfgShowPane } from "./ui/sheets.js";
import { ghCheckOut } from "./ui/sheets.js";
import { ghCheck } from "./ui/sheets.js";
import { syncsheet } from "./ui/sheets.js";
import { pubItemIcon } from "./ui/sheets.js";
import { textSizePref } from "./ui/sheets.js";
import { jobsNotify } from "./model/jobs.js";
import { CFG_PANES } from "./ui/sheets.js";
import { pubCompareDraft } from "./ui/sheets.js";
import { jobsAutoClear } from "./ui/sheets.js";
import { ghCheckMessage } from "./ui/sheets.js";
import { draftWrite } from "./model/versions.js";
import { localDraftWrite } from "./model/versions.js";
import { idbDraftPut } from "./platform/storage.js";
import { wmInnerHeight } from "./ui/wm.js";
import { WM_WINDOWS } from "./ui/wm.js";
import { wmZoneForPointer } from "./ui/wm.js";
import { wmShowDropZone } from "./ui/wm.js";
import { wmHideDropZone } from "./ui/wm.js";
import { wmLoad } from "./ui/wm.js";
import { wmRemoveSideTab } from "./ui/wm.js";
import { wmClearBottom } from "./ui/wm.js";
import { wmSave } from "./ui/wm.js";
import { wmSideCells } from "./ui/wm.js";
import { wmAllowed } from "./ui/wm.js";
import { wmInnerWidth } from "./ui/wm.js";
import { wmWhereIs } from "./ui/wm.js";
import { wmSetActiveSideTab } from "./ui/wm.js";
import { wmClampSize } from "./ui/wm.js";
import { wmWindowTitle } from "./ui/wm.js";
import { wmLayoutBottom } from "./ui/wm.js";
import { wmSyncDockButtons } from "./ui/wm.js";
import { wmAddSideTab } from "./ui/wm.js";
import { wmSetSideMode } from "./ui/wm.js";
import { wmDockBottom } from "./ui/wm.js";
import { wmMenuItem } from "./ui/wm.js";
import { wmCloseMenu } from "./ui/wm.js";
import { wmSetSideWidth } from "./ui/wm.js";
import { WM_DEFAULT_W } from "./ui/wm.js";
import { wmSetBottomHeight } from "./ui/wm.js";
import { WM_DEFAULT_H } from "./ui/wm.js";
import { wmSetBottomSplit } from "./ui/wm.js";
import { WM_KEY } from "./ui/wm.js";
import { WM_OLD_KEY } from "./ui/wm.js";
import { WM_MIN_W } from "./ui/wm.js";
import { WM_MIN_H } from "./ui/wm.js";
import { WM_MIN_SPLIT } from "./ui/wm.js";
import { WM_PHONE_MAX } from "./ui/wm.js";
import { WM_ZONE_FRAC } from "./ui/wm.js";
import { WM_EDGE_GAP } from "./ui/wm.js";
import { wmClampHeight } from "./ui/wm.js";
import { wmClampSplit } from "./ui/wm.js";
import { wmMigrate } from "./ui/wm.js";
import { wmMigrateShape } from "./ui/wm.js";
import { wmMigrateShapeB } from "./ui/wm.js";
import { wmSetSide } from "./ui/wm.js";
import { wmClearSide } from "./ui/wm.js";
import { wmZoneFor } from "./ui/wm.js";
import { wmDockLabel } from "./ui/wm.js";
import { wmDockShort } from "./ui/wm.js";
import { draw } from "./hooks.js";
import { playbackFrame } from "./hooks.js";
import { drawFull } from "./ui/chrome.js";
import { resize } from "./ui/chrome.js";
import { updateCanvasA11y } from "./ui/chrome.js";
import { pushUndo } from "./model/edits.js";
import { addTrackUndoable } from "./model/edits.js";
import { clampView } from "./hooks.js";
import { minPxq } from "./ui/chrome.js";
import { pxqFloor } from "./ui/chrome.js";
import { rowHFloor } from "./ui/chrome.js";
import { PAN_TAIL_BARS } from "./ui/chrome.js";
import { dispPitchExtent } from "./ui/chrome.js";
import { ROLL_AIR } from "./ui/chrome.js";
import { saveDraft } from "./model/versions.js";
import { scheduleBackupFlush } from "./hooks.js";
import { retireOldOverlay } from "./model/versions.js";
import { filesMirrorSoon } from "./model/versions.js";
import { filesMirror } from "./model/versions.js";
import { draftRead } from "./model/versions.js";
import { flushBackupNow } from "./ui/chrome.js";
import { localDraftTracks } from "./model/versions.js";
import { bsRange } from "./ui/sheets.js";
import { drRange } from "./ui/sheets.js";
import { drPartsGet } from "./ui/sheets.js";
import { drKitCountT } from "./ui/sheets.js";
import { segSet } from "./ui/sheets.js";
import { drPartsSet } from "./ui/sheets.js";
import { drPartsSync } from "./ui/sheets.js";
import { computeSongEnd } from "./model/song.js";
import { dpTick } from "./ui/sheets.js";
import { undoTrackAdd } from "./model/edits.js";
import { refreshSelInfo } from "./ui/note-editor.js";
import { renderOctBtn } from "./ui/note-editor.js";
import { reflectSelVel } from "./ui/note-editor.js";
import { installHooks } from "./wire.js";
import { resumeAudio } from "./audio/engine.js";
import { ensureAudio } from "./audio/engine.js";
import { rebuildAudio } from "./audio/engine.js";
import { metStart } from "./audio/metronome.js";
import { chipSource } from "./audio/chip.js";
import { CHIPS } from "./audio/chip.js";
import { chipModules } from "./audio/chip.js";
import { chipEstimateTracks } from "./audio/chip.js";
import { chipCleanupAfterFailure } from "./audio/chip.js";
import { chipExt } from "./audio/chip.js";
import { PSX_SOUNDING_ON } from "./audio/chip.js";
import { chipVaultFile } from "./audio/chip.js";
import { sonySeqCapture } from "./audio/chip.js";
import { psfInflater } from "./audio/chip.js";
import { chipStreamOpenWorker } from "./audio/chip-stream.js";
import { gameLibSync } from "./audio/voices.js";
import { sf2Sync } from "./audio/voices.js";
import { scheduleGameNote } from "./audio/voices.js";
import { gameNoteCache } from "./audio/voices.js";
import { gameNoteBucket } from "./audio/voices.js";
import { gameVoiceWarned } from "./audio/voices.js";
import { gameVoiceWarn } from "./audio/voices.js";
import { resolveVoiceInstrument } from "./audio/voices.js";
import { fitView } from "./hooks.js";
import { renderTrackbar } from "./hooks.js";
import { updateEditBtnVis } from "./hooks.js";
import { updateChipBtn } from "./hooks.js";
import { updateSubtitle } from "./hooks.js";
import { askRender } from "./hooks.js";
import { finalizeNotes } from "./hooks.js";
import { recFinish } from "./hooks.js";
import { albumAdvance } from "./hooks.js";
import { updateSongMeta } from "./hooks.js";
import { chipRender } from "./audio/chip.js";
import { chipPublish } from "./audio/chip.js";
import { chipRenderInWorker } from "./audio/chip.js";
import { chipRenderAuto } from "./audio/chip-stream.js";
import { chipStreamOpen } from "./audio/chip-stream.js";
import { buildSchedule } from "./audio/transport.js";
import { tombKeyFor } from "./model/edits.js";
import { noteIdentity } from "./model/edits.js";
import { annoSnapshot } from "./model/edits.js";
import { tombstone } from "./model/edits.js";
import { tombKey } from "./model/edits.js";
import { saveLocalNotes } from "./model/edits.js";
import { setClipDir } from "./audio/clips.js";
import { splitClipAt } from "./audio/clips.js";
import { deleteClip } from "./audio/clips.js";
import { writeClips } from "./audio/clips.js";
import { titleCompare } from "./model/catalog.js";
import { romanValue } from "./model/catalog.js";
import { titleSortKey } from "./model/catalog.js";
import { resolveGameVault } from "./audio/voices.js";
import { instAlbums } from "./audio/voices.js";
import { instLibrary } from "./audio/voices.js";
import { sf2Font } from "./audio/voices.js";
import { instPlayer } from "./audio/voices.js";
import { gameVoicesInSong } from "./audio/voices.js";
import { instPlayerReady } from "./audio/voices.js";
import { instSamples } from "./audio/voices.js";
import { sf2VoicesInSong } from "./audio/voices.js";
import { sf2Module } from "./audio/voices.js";
import { sf2Fonts } from "./audio/voices.js";
import { instLibs } from "./audio/voices.js";
import { instWavs } from "./audio/voices.js";
import { instDecodeWav } from "./audio/voices.js";
import { INST_CHIPS } from "./audio/voices.js";
import { instFolder } from "./audio/voices.js";
import { sf2Bytes } from "./audio/voices.js";
import { albumStrip } from "./audio/transport.js";
import { stretchEnsureAll } from "./audio/clips.js";
import { scheduleClip } from "./audio/clips.js";
import { audioChaseNow } from "./audio/clips.js";
import { stretchEnsure } from "./audio/clips.js";
import { sfPreloadForSong } from "./audio/voices.js";
import { gamePreloadForSong } from "./audio/voices.js";
import { scheduleNote } from "./audio/voices.js";
import { gamePreloadTokens } from "./audio/voices.js";
import { sfWaitForSong } from "./audio/voices.js";
import { gameWaitForSong } from "./audio/voices.js";
import { stop } from "./audio/transport.js";
import { play } from "./audio/transport.js";
import { playGateTick } from "./audio/transport.js";
import { playGateKick } from "./audio/transport.js";
import { playGateWait } from "./audio/transport.js";
import { PLAY_GATE_GRACE } from "./audio/transport.js";
import { PLAY_GATE_MAX } from "./audio/transport.js";
import { gateSettled } from "./audio/transport.js";
import { gateWatched } from "./audio/transport.js";
import { gatePending } from "./audio/transport.js";
import { playGate } from "./audio/transport.js";
import { playGateActive } from "./audio/transport.js";
import { previewNote } from "./audio/voices.js";
import { applyAudioDirs } from "./audio/clips.js";
import { setSongTempo } from "./audio/clips.js";
import { applyBeatMap } from "./audio/clips.js";
import { audioEnsureFile } from "./audio/clips.js";
import { renderSongOffline } from "./audio/bounce.js";
import { offlineWaitForAssets } from "./audio/bounce.js";
import { filesMirrorFor } from "./model/versions.js";
import { transposeChordLabel } from "./theory/chords.js";
import { dropLocalKeyAt } from "./model/rollnotes.js";
import { adoptChordBand } from "./gen/analysis.js";
import { adoptKeyRegion } from "./gen/analysis.js";
import { adoptAllChords } from "./gen/analysis.js";
import { scheduleAnalysisRecompute } from "./gen/analysis.js";
import { loadEdits } from "./model/edits.js";
import { saveEdits } from "./model/edits.js";
import { foldOldOverlay } from "./model/edits.js";
import { insertTime } from "./model/selection.js";
import { deleteTime } from "./model/selection.js";
import { clearMultiSel } from "./model/selection.js";
import { duplicateSelectionInPlace } from "./model/selection.js";
import { selEditApply } from "./model/selection.js";
import { deleteSelection } from "./model/selection.js";
import { transposeTrack } from "./model/selection.js";
import { removeDuplicateNotes } from "./model/selection.js";
import { sweepStrandedClones } from "./model/selection.js";
import { copySelection } from "./model/selection.js";
import { pasteClipboard } from "./model/selection.js";
import { nudgeSelection } from "./model/selection.js";
import { diatonicShift } from "./model/selection.js";
import { divideSelection } from "./model/selection.js";
import { quantizeSelection } from "./model/selection.js";
import { cutSelection } from "./model/selection.js";
import { splitSelectionAt } from "./model/selection.js";
import { splitSelectionHalves } from "./model/selection.js";
import { joinSelection } from "./model/selection.js";
import { duplicateSelection } from "./model/selection.js";
import { resizeSelection } from "./model/selection.js";
import { openGapShift } from "./model/selection.js";
import { ridealongChordBands } from "./model/selection.js";
import { pasteAnnotations } from "./model/selection.js";
import { splitApply } from "./model/selection.js";
import { closeGap } from "./model/selection.js";
import { moveClip } from "./audio/clips.js";
import { trimClip } from "./audio/clips.js";
import { splitSelectedClipAtCursor } from "./audio/clips.js";
import { drGenerate } from "./gen/drummer.js";
import { bsGenerate } from "./gen/bassist.js";
import { applyTake } from "./gen/bassist.js";
import { subtractTombstones } from "./model/rollnotes.js";
import { mergeLocalAdditions } from "./model/rollnotes.js";
import { annotationsFor } from "./model/rollnotes.js";
import { resolveNoteWith } from "./model/rollnotes.js";
import { bakeTempos } from "./model/rollnotes.js";
import { bakeMeter } from "./model/rollnotes.js";
import { draftFingerprint } from "./model/versions.js";
import { cmpBar } from "./ui/chrome.js";
import { syncDurSeg } from "./ui/note-editor.js";
import { finalizeNotesImpl } from "./session/song.js";
import { reflectSongURL } from "./session/song.js";
import { loadSong } from "./session/song.js";
import { openDraft } from "./session/song.js";
import { setSong } from "./session/song.js";
import { rememberRecentSong } from "./session/song.js";
import { loadNotes } from "./session/song.js";
import { loadSongInner } from "./session/song.js";
import { fitViewImpl } from "./session/song.js";
import { updateSongMetaImpl } from "./session/song.js";
import { openDraftDoc } from "./session/song.js";
import { albumPrev } from "./session/album.js";
import { albumNext } from "./session/album.js";
import { albumLeave } from "./session/album.js";
import { albumClear } from "./session/album.js";
import { albumStart } from "./session/album.js";
import { armAlbumLink } from "./session/album.js";
import { albumPos } from "./session/album.js";
import { albumPlayIdx } from "./session/album.js";
import { albumAdvanceImpl } from "./session/album.js";
import { fillFolderSelect } from "./session/files.js";
import { openSaveForm } from "./session/files.js";
import { forkCurrentSong } from "./session/files.js";
import { saveSongAs } from "./session/files.js";
import { saveVersion } from "./session/files.js";
import { renameLocalKeys } from "./session/files.js";
import { folderChoices } from "./session/files.js";
import { localFolders } from "./session/files.js";
import { songRegionRight } from "./ui/chrome.js";
import { placeLassoBtn } from "./ui/chrome.js";
import { updateEditBtnVisImpl } from "./ui/chrome.js";
import { toggleHl } from "./ui/chrome.js";
import { updateLCD } from "./ui/chrome.js";
import { updateSubtitleImpl } from "./ui/chrome.js";
import { updateChipBtnImpl } from "./ui/chrome.js";
import { updateChipBtnInner } from "./ui/chrome.js";
import { openNoteList } from "./ui/notes.js";
import { renderNoteList } from "./ui/notes.js";
import { updateChordStale } from "./ui/notes.js";
import { useFileKey } from "./ui/notes.js";
import { renderGameInstNav } from "./ui/sheets.js";
import { instAudition } from "./ui/sheets.js";
import { gameInstUsedBySong } from "./ui/sheets.js";
import { sf2Registry } from "./ui/sheets.js";
import { instKeys } from "./ui/sheets.js";
import { sf2RegistryAdd } from "./ui/sheets.js";
import { renderInstSheet } from "./ui/sheets.js";
import { INST_SYS_ORDER } from "./ui/sheets.js";
import { gameSongRows } from "./ui/sheets.js";
import { songInstrumentRows } from "./ui/sheets.js";
import { currentSongGameContext } from "./ui/sheets.js";
import { usedInstruments } from "./ui/sheets.js";
import { usedInstrumentRows } from "./ui/sheets.js";
import { openDrummer } from "./ui/sheets.js";
import { openBassist } from "./ui/sheets.js";
import { bsRefresh } from "./ui/sheets.js";
import { drRefresh } from "./ui/sheets.js";
import { bsBuildControls } from "./ui/sheets.js";
import { drBuildControls } from "./ui/sheets.js";
import { wmFloat } from "./ui/wm.js";
import { wmDockBottomWindow } from "./ui/wm.js";
import { wmDockSide } from "./ui/wm.js";
import { makeWindow } from "./ui/wm.js";
import { wmSideDividerize } from "./ui/wm.js";
import { wmLayoutAll } from "./ui/wm.js";
import { wmCloseWindow } from "./ui/wm.js";
import { wmLayoutSide } from "./ui/wm.js";
import { wmLayoutTabs } from "./ui/wm.js";
import { wmSetSideModeFor } from "./ui/wm.js";
import { wmOpenMenu } from "./ui/wm.js";
import { trackToggle } from "./ui/trackbar.js";
import { saveTrackDir } from "./ui/trackbar.js";
import { saveVoices } from "./ui/trackbar.js";
import { renameTrack } from "./ui/trackbar.js";
import { toggleMixer } from "./ui/mixer.js";
import { renderMixer } from "./ui/mixer.js";
import { reorderTrack } from "./ui/mixer.js";
import { mixerStripEl } from "./ui/mixer.js";
import { mixerStripDragize } from "./ui/mixer.js";
import { openMixer } from "./ui/mixer.js";
import { closeMixer } from "./ui/mixer.js";
import { openVoiceMenu } from "./ui/voice-menu.js";
import { gameVoiceLabels } from "./ui/voice-menu.js";
import { gameVoiceLabel } from "./ui/voice-menu.js";
import { sf2VoiceLabels } from "./ui/voice-menu.js";
import { sf2VoiceLabel } from "./ui/voice-menu.js";
import { buildVoiceMenu } from "./ui/voice-menu.js";
import { buildGameVoicePicker } from "./ui/voice-menu.js";
import { openGameVoiceMenuTo } from "./ui/voice-menu.js";
import { renderSf2Nav } from "./ui/voice-menu.js";
import { sf2AuditionPreset } from "./ui/voice-menu.js";
import { buildSf2VoicePicker } from "./ui/voice-menu.js";
import { buildClipControls } from "./ui/voice-menu.js";
import { gameVaultResolved } from "./ui/voice-menu.js";
import { resolvedGameVaultSync } from "./ui/voice-menu.js";
import { renderTrackbarImpl } from "./ui/trackbar.js";
import { folderTree } from "./model/catalog.js";
import { subfolderKeys } from "./model/catalog.js";
import { nodeCount } from "./model/catalog.js";
import { publishedLabel } from "./model/catalog.js";
import { nodeAt } from "./model/catalog.js";
import { parentFolder } from "./model/catalog.js";
import { retireEdited } from "./model/edits.js";
import { pruneTombstones } from "./model/edits.js";
import { clearTombstonesFor } from "./model/edits.js";
import { clearTombstones } from "./model/edits.js";
import { jobsClearFinished } from "./ui/sheets.js";
import { jobStart } from "./ui/sheets.js";
import { jobsLoad } from "./ui/sheets.js";
import { cmpExit } from "./ui/chrome.js";
import { cmpEnter } from "./ui/chrome.js";
import { cmpShow } from "./ui/chrome.js";
import { askCommitLog } from "./ask/bridge.js";
import { askSave } from "./ask/bridge.js";
import { createComposition } from "./session/files.js";
import { makeItMine } from "./session/files.js";
import { editHereNow } from "./session/files.js";
import { forkClashTitle } from "./session/files.js";
import { updateManifest } from "./sync/publish.js";
import { manifestPlace } from "./sync/publish.js";
import { renameImportDraft } from "./import/capture.js";
import { chipKindOf } from "./import/capture.js";
import { importSf2File } from "./import/capture.js";
import { AUDIO_SIZE_GATE } from "./import/capture.js";
import { monoWavBytes } from "./import/capture.js";
import { slugFile } from "./import/capture.js";
import { chipTrackOrder } from "./import/capture.js";
import { impRename } from "./import/capture.js";
import { impStatus } from "./import/capture.js";
import { computeImportAlbumJson } from "./import/capture.js";
import { SF2_SIZE_WARN } from "./import/capture.js";
import { SF2_SIZE_REFUSE } from "./import/capture.js";
import { chipVaultMeta } from "./import/capture.js";
import { nsfModules } from "./import/capture.js";
import { songsheet } from "./ui/chrome.js";
import { songStatus } from "./ui/chrome.js";
import { openDropUp } from "./ui/chrome.js";
import { closeFileMenus } from "./ui/chrome.js";
import { filesheet } from "./ui/chrome.js";
import { filesub } from "./ui/chrome.js";
import { fileStatus } from "./ui/chrome.js";
import { draftRow } from "./ui/chrome.js";
import { openChipImport } from "./import/capture.js";
import { commitImports } from "./import/capture.js";
import { captureJobStart } from "./import/capture.js";
import { captureChipTrack } from "./import/capture.js";
import { openNsfImport } from "./import/capture.js";
import { impCapture } from "./import/capture.js";
import { batchCommit } from "./import/capture.js";
import { renameRepoTitles } from "./sync/publish.js";
import { fingerprintOldDrafts } from "./sync/publish.js";
import { publishJobStart } from "./sync/publish.js";
import { publishUnsavedSong } from "./sync/publish.js";
import { renameRepoTitle } from "./sync/publish.js";
import { publishSong } from "./sync/publish.js";
import { copyAudioClips } from "./sync/publish.js";
import { publishOpenComposition } from "./sync/publish.js";
import { publishAllJobStart } from "./sync/publish.js";
import { discardPending } from "./sync/publish.js";
import { markPublished } from "./sync/publish.js";
import { markCurrentSongSynced } from "./sync/publish.js";
import { renderSyncPending } from "./ui/sheets.js";
import { openSyncSheet } from "./ui/sheets.js";
import { moveComposition } from "./session/files.js";
import { revertSongToRepo } from "./session/files.js";
import { createGameFilesRepo } from "./import/hub.js";
import { openPickedFiles } from "./import/hub.js";
import { importAudioFiles } from "./import/hub.js";
import { localMidiOpen } from "./import/hub.js";
import { fsubFolder } from "./import/hub.js";
import { fsubAlbums } from "./import/hub.js";
import { nativeOpenHook } from "./import/hub.js";
import { decodeM3u } from "./import/hub.js";
import { parseM3u } from "./import/hub.js";
import { applyM3uNames } from "./import/hub.js";
import { applyM3uToAlbum } from "./import/hub.js";
import { nativeOpenUrl } from "./import/hub.js";
import { fsubItem } from "./import/hub.js";
import { fsubHeader } from "./import/hub.js";
import { fsubSongs } from "./import/hub.js";
import { fsubLocalFolder } from "./import/hub.js";
import { fsubImportAlbum } from "./import/hub.js";
import { askRunTool } from "./ask/tools.js";
import { askAddAnnotation } from "./ask/tools.js";
import { askEditAnnotation } from "./ask/tools.js";
import { askDeleteAnnotation } from "./ask/tools.js";
import { askPublishSong } from "./ask/tools.js";
import { askWriteNotes } from "./ask/tools.js";
import { askInsertBars } from "./ask/tools.js";
import { askCopyBars } from "./ask/tools.js";
import { askDeleteBars } from "./ask/tools.js";
import { askContext } from "./ask/context.js";
import { askKeyStateLine } from "./ask/context.js";
import { askShotShow } from "./ask/shots.js";
import { askShotTake } from "./ask/shots.js";
import { askShotCapture } from "./ask/shots.js";
import { deployHoldNow } from "./ask/bridge.js";
import { deployInstallNow } from "./ask/bridge.js";
import { deployWarn } from "./ask/bridge.js";
import { deploySetHeld } from "./ask/bridge.js";
import { deployAskTap } from "./ask/bridge.js";
import { deployBeforeInstall } from "./ask/bridge.js";
import { aiHostOk } from "./ask/backend.js";
import { askBubble } from "./ask/sheet.js";
import { askFillBubble } from "./ask/sheet.js";
import { askMicOff } from "./ask/sheet.js";
import { askResume } from "./ask/client.js";
import { askResumeSoon } from "./ask/client.js";
import { askSend } from "./ask/client.js";
import { askFinish } from "./ask/client.js";
import { askFail } from "./ask/client.js";
import { askLanded } from "./ask/client.js";
import { askRun } from "./ask/client.js";
import { askTerminalSend } from "./ask/client.js";
import { askRepending } from "./ask/client.js";
import { askStatusPoll } from "./ask/bridge.js";
import { askInboxPoll } from "./ask/bridge.js";
import { askInboxStart } from "./ask/bridge.js";
import { askNoteSeen } from "./ask/bridge.js";
import { askTabsApply } from "./ask/bridge.js";
import { askNotesArrived } from "./ask/bridge.js";
import { askRenderImpl } from "./ask/sheet.js";
import { askRenderEarlier } from "./ask/sheet.js";
import { askBtnTap } from "./ask/host.js";
import { openAsk } from "./ask/host.js";
import { initWebMidi } from "./input/record.js";
import { recNoteOff } from "./input/record.js";
import { recNoteOn } from "./input/record.js";
import { recFinishImpl } from "./input/record.js";
import { midiMessage } from "./input/record.js";
import { initCoreMidi } from "./input/record.js";
import { instPointerDown } from "./input/keyboard.js";
import { instPointerMove } from "./input/keyboard.js";
import { instPointerUp } from "./input/keyboard.js";
import { instSetMode } from "./input/keyboard.js";
import { instSetLock } from "./input/keyboard.js";
import { instSetSustain } from "./input/keyboard.js";
import { instReleaseAll } from "./input/keyboard.js";
import { guitarHit } from "./input/keyboard.js";
import { instPlay } from "./input/keyboard.js";
import { instReleaseVoice } from "./input/keyboard.js";
import { instReleaseHeld } from "./input/keyboard.js";
import { setInstInfo } from "./input/keyboard.js";
import { instTap } from "./input/keyboard.js";
import { INST_PAN_SLOP } from "./input/keyboard.js";
import { instPtrXY } from "./input/keyboard.js";
import { instPtrMeanX } from "./input/keyboard.js";
import { instLetGo } from "./input/keyboard.js";
import { instPtrPlayed } from "./input/keyboard.js";
import { instPtrTicket } from "./input/keyboard.js";
import { instScrollPersist } from "./input/keyboard.js";
import { moveSelectionToTrack } from "./model/selection.js";
import { noteLabel } from "./input/gestures.js";
import { beatLabel } from "./input/gestures.js";
import { cycleSecDepth } from "./ui/chrome.js";
import { setSecDepth } from "./ui/chrome.js";
import { gridFollowNote } from "./ui/note-editor.js";
import { scorePencil } from "./input/gestures.js";
import { scoreErase } from "./input/gestures.js";
import { scoreTap } from "./input/gestures.js";
import { scorePencilTick } from "./input/gestures.js";
import { scoreStaveAt } from "./input/gestures.js";
import { hitTracksNote } from "./input/gestures.js";
import { hitNote } from "./input/gestures.js";
import { hitTracksClip } from "./input/gestures.js";
import { placePencilNote } from "./input/gestures.js";
import { scrubTo } from "./input/gestures.js";
import { endPointer } from "./input/gestures.js";
import { finalizeLasso } from "./input/gestures.js";
import { toggleSel } from "./input/gestures.js";
import { fallHitNote } from "./input/gestures.js";
import { scoreLassoTap } from "./input/gestures.js";
import { seekOrMoveCursor } from "./input/gestures.js";
import { tap } from "./input/gestures.js";
import { cofAngle } from "./input/gestures.js";
import { cofRelease } from "./input/gestures.js";
import { governingAt } from "./ui/chrome.js";
import { toggleSubtitle } from "./ui/chrome.js";
import { applyListener } from "./ui/chrome.js";
import { setViewMode } from "./ui/chrome.js";
import { applyMode } from "./ui/chrome.js";
import { fileMenuSaveLabels } from "./ui/chrome.js";
import { renderOpenRecentRow } from "./ui/chrome.js";
import { applyViewMode } from "./ui/chrome.js";
import { recentSongsForMenu } from "./ui/chrome.js";
import { recentAlbumFor } from "./ui/chrome.js";
import { songPitchExtent } from "./ui/chrome.js";
import { renderSongGroups } from "./ui/chrome.js";
import { renderFolder } from "./ui/chrome.js";
import { renderSongList } from "./ui/chrome.js";
import { openSongPicker } from "./ui/chrome.js";
import { openRecentSong } from "./ui/chrome.js";
import { speedsl } from "./ui/chrome.js";
import { speedlbl } from "./ui/chrome.js";
import { applySpeed } from "./ui/chrome.js";
import { speedreset } from "./ui/chrome.js";
import { volsl } from "./ui/chrome.js";
import { vollbl } from "./ui/chrome.js";
import { speedbtn } from "./ui/chrome.js";
import { _applySpeedInner } from "./ui/chrome.js";
import { volbtn } from "./ui/chrome.js";
import { initChrome1 } from "./ui/chrome.js";
import { convertAnchors } from "./model/rollnotes.js";
import { shiftAnchors } from "./model/rollnotes.js";
import { annoRestore } from "./model/rollnotes.js";
import { editUndoPop } from "./ui/note-editor.js";
import { editRedoPop } from "./ui/note-editor.js";
import { selectAllNotes } from "./ui/note-editor.js";
import { invertEdit } from "./ui/note-editor.js";
import { applyEditEntry } from "./ui/note-editor.js";
installHooks(); // docs/split-phase2-plan.md §1 M1: before any init*() / top-level effect — every S.hooks port throws if called first
try {
  if (S.APP_BASE && document.head && !document.querySelector("base")) {
    const b = document.createElement("base"); b.href = S.APP_BASE;
    document.head.insertBefore(b, document.head.firstChild);
  }
} catch (e) {}
 try {
  const q = typeof location !== "undefined" && songPathFromURL(location.href);
  if (q) setDocTitle(titleCaseSlug(q.split("/").pop().replace(/\.midi?$/i, "")));
} catch (e) {}
// Night Roll — FF1 OST analysis player. READ NIGHT-ROLL.md FIRST:
// feature inventory, the .rollnotes format spec, this file's section map,
// and the project conventions (keys are Josh's discoveries — never pre-fill).
"use strict";
S.APP_MODE = (() => {
  try {
    const v = localStorage.getItem("ff1roll-mode");
    if (v === "learning" || v === "normal") return v; // never overwritten once set
    const mode = hasExistingNightRollPrefs() ? "learning" : "normal";
    localStorage.setItem("ff1roll-mode", mode);
    return mode;
  } catch (e) { return "learning"; } // storage denied: default to the law
})();
 if (typeof document !== "undefined" && document.body) {
  document.body.dataset.mode = S.APP_MODE;
}
 if (PERF_FLAGS.get("dpr")) { // override the source, not the call sites — every
  const forced = +PERF_FLAGS.get("dpr") || 1; // dpr read in the app picks it up
  try { Object.defineProperty(window, "devicePixelRatio", {get: () => forced, configurable: true}); }
  catch (err) { /* locked down: the flag simply does nothing */ }
}
         
 
                                        const HOLD_MS = 160; // hold-to-grab dwell (was 230 — "way too damn hard", 2026-08-24)
const HOLD_SLOP = 20;                                                                                             // rollnote being edited, or null for new
const RULER_RANGE_SLOP = 24;                                                           // An anchored menu/dropdown clamped against raw window.innerWidth could open
 S.RULER_W = RULER_W_ROLL;
S.STRIP_Y = BASE_RULER_H;
S.RULER_H = S.STRIP_Y + STRIP_H;
           

(function migrateAlbumPaths() {
  const remap = v => v.replace(/^(ff1roll-(?:notes|edits|ts)-)?midi\//, "$1albums/final-fantasy-i/songs/")
                     .replace(/^(ff1roll-(?:notes|edits|ts)-)?compositions\//, "$1albums/compositions/");
  for (const k of Object.keys(localStorage)) {
    if (!/^ff1roll-(notes|edits|ts)-(midi|compositions)\//.test(k)) continue;
    const nk = remap(k);
    if (!localStorage.getItem(nk)) localStorage.setItem(nk, localStorage.getItem(k));
    localStorage.removeItem(k);
  }
  const last = localStorage.getItem("ff1roll-lastsong");
  if (last && /^(midi|compositions)\//.test(last))
    rememberLastSong(remap(last));
  // second wave (same day): ff1 filename prefix dropped, multiword names hyphenated
  const SONGS = "albums/final-fantasy-i/songs/";
  const RENAME = {ff1corneliacastle: "cornelia-castle", ff1gurguvolcano: "gurgu-volcano",
    ff1matouyascave: "matoyas-cave", ff1chaostemple: "chaos-temple",
    ff1floatingcastle: "floating-castle", ff1underwaterpalace: "underwater-palace",
    ff1gameover: "game-over"};
  const remap2 = v => v.replace(new RegExp("(" + SONGS.replace(/[/]/g, "\\/") + ")ff1([a-z]+)(\\.mid)"),
    (all, pre, base, ext) => pre + (RENAME["ff1" + base] || base) + ext);
  for (const k of Object.keys(localStorage)) {
    if (!/^ff1roll-(notes|edits|ts)-/.test(k) || !k.includes(SONGS + "ff1")) continue;
    const nk = remap2(k);
    if (nk !== k) {
      if (!localStorage.getItem(nk)) localStorage.setItem(nk, localStorage.getItem(k));
      localStorage.removeItem(k);
    }
  }
  const last2 = localStorage.getItem("ff1roll-lastsong");
  if (last2 && last2.includes(SONGS + "ff1"))
    rememberLastSong(remap2(last2));
  // third wave (2026-09-23, Josh's cleanup): two of his songs moved — every
  // per-song key rides along so no device shows an orphan draft
  const MOVED = {"albums/compositions/nightroll/town-theme.mid": "albums/compositions/nightroll/carnival.mid",
                 "albums/compositions/KeyChangeTest-07-26.mid": "albums/compositions/nightroll/KeyChangeTest-07-26.mid"};
  for (const k of Object.keys(localStorage)) {
    const m = k.match(/^(ff1roll-(?:notes|edits|ts|draft|tombs|lastsync)-)(.+)$/);
    if (!m || !MOVED[m[2]]) continue;
    const nk = m[1] + MOVED[m[2]];
    if (!localStorage.getItem(nk)) localStorage.setItem(nk, localStorage.getItem(k));
    localStorage.removeItem(k);
  }
  const last3 = localStorage.getItem("ff1roll-lastsong");
  if (last3 && MOVED[last3]) rememberLastSong(MOVED[last3]);
  // fourth wave (2026-09-27, "just folders"): whole folders moved under console
  // folders — every per-song key follows by prefix (MOVED_DIRS, defined with the
  // link parser); a capture's draft from imports/ is stamped as a capture so
  // it stays read-only (its new folder no longer says so by name)
  for (const k of Object.keys(localStorage)) {
    const m = k.match(/^(ff1roll-(?:notes|edits|ts|draft|tombs|lastsync|save|stash|ask)-)(.+)$/);
    if (!m) continue;
    const np = movedPath(m[2]);
    if (!np) continue;
    let v = localStorage.getItem(k);
    if (m[1] === "ff1roll-draft-" && m[2].startsWith("albums/imports/")) {
      try { const d = JSON.parse(v); if (d && typeof d === "object") { d.capture = true; v = JSON.stringify(d); } } catch (err) { /* keep as is */ }
      if (typeof idbDraftMove === "function") idbDraftMove(m[2], np); // big drafts keep their notes in IndexedDB
    }
    if (!localStorage.getItem(m[1] + np)) localStorage.setItem(m[1] + np, v);
    localStorage.removeItem(k);
  }
  const last4 = localStorage.getItem("ff1roll-lastsong");
  if (last4 && movedPath(last4)) rememberLastSong(movedPath(last4));
})();
// The first song a fresh device sees. Overworld on the web; the app edition
// ships only the starter albums (FF1 rips are not ours to sell), so a
// hardcoded path would fail there (Josh, 2026-09-27: "Couldn't open
// Overworld. Load failed" on the packaged shell's first launch).
function homeSong(all) {
  const ow = "albums/nes/final-fantasy-i/songs/overworld.mid";
  return all.includes(ow) ? ow : (all[0] || ow);
}
 document.getElementById("lcdtemposeg").addEventListener("click", () => {
  if (!S.song) return; // the song's opening tempo — always bar 1, not the cursor (Josh, 2026-10-01: "I almost always want the whole song"; a mid-song change is + Note)
  openEditor(governingAt(n => n.tempodir !== undefined, 0), "tempo", {atStart: true});
});
// meter and key are independent targets in the shared segment (Josh, 2026-08-19)
document.getElementById("lcdmeter").addEventListener("click", e => {
  if (!S.song) return;
  e.stopPropagation();
  openEditor(governingAt(n => !!n.tsdir, 0), "timesig", {atStart: true}); // bar 1, not the cursor (see the tempo segment)
});
document.getElementById("lcdkey").addEventListener("click", e => {
  if (!S.song) return;
  e.stopPropagation();
  const kn = governingAt(n => n.keydir !== undefined || n.keypartial, 0); // bar 1, not the cursor (see the tempo segment)
  openEditor(kn, kn ? undefined : "key", {atStart: true});
});

 
document.getElementById("trackmore").addEventListener("click", () => {
  S.trackExpand = !S.trackExpand;
  updateTrackMore();
});
if (typeof document !== "undefined" && document.body && typeof ResizeObserver === "function") {
  const tr = document.getElementById("trackrow");
  if (tr) new ResizeObserver(scheduleFitTrackRow).observe(tr); // the row's WIDTH changes with the window/dock; stacking only changes its height
  const tb = document.getElementById("trackbar");
  if (tb && typeof MutationObserver === "function") new MutationObserver(scheduleFitTrackRow).observe(tb, {childList: true}); // tracks added/removed change the need
}
// slide the whole chip cluster away when the row feels noisy (Josh, 2026-08-15)
{
  const slide = document.getElementById("trackslide");
  const tog = document.getElementById("tracktoggle");
  const apply = hidden => {
    slide.classList.toggle("off", hidden);
    tog.textContent = hidden ? "▸" : "◂";
    tog.setAttribute("aria-label", hidden ? "Show tracks" : "Hide tracks");
    if (!hidden) updateTrackMore();
  };
  tog.addEventListener("click", () => {
    const hidden = !slide.classList.contains("off");
    localStorage.setItem("ff1roll-tracks-hidden", hidden ? "1" : "0");
    apply(hidden);
  });
  // re-measure once the slide animation actually finishes — measuring at a
  // transitional width wrapped chips onto phantom rows (Josh's toggle bug)
  slide.addEventListener("transitionend", () => {
    if (!slide.classList.contains("off")) updateTrackMore();
  });
  apply(localStorage.getItem("ff1roll-tracks-hidden") === "1");
}
 
 
 renderOctBtn(); // boot: correct checkmark before any selection ever runs refreshSelInfo
document.getElementById("octbtn").addEventListener("click", () => {
  S.selOctaves = !S.selOctaves;
  localStorage.setItem("ff1roll-seloct", S.selOctaves ? "1" : "0");
  refreshSelInfo();
});
  
    function openInsertBars() {
  const bt = barTicks(), qt = beatTicks();
  document.getElementById("insb").value = Math.floor(S.playCursor / bt) + 1;
  document.getElementById("insq").value = Math.round(((S.playCursor % bt) / qt + 1) * 100) / 100;
  const row = document.getElementById("insunit");
  row.innerHTML = "";
  for (const u of ["bars", "beats", "16ths"]) {
    const b = document.createElement("button");
    b.textContent = u;
    b.className = "chip" + (S.insUnit === u ? " selected" : "");
    b.style.cssText = "min-height:44px;justify-content:center" +
      (S.insUnit === u ? ";background:var(--gold);color:#111;font-weight:700" : "");
    b.addEventListener("click", () => { S.insUnit = u; openInsertBars(); });
    row.appendChild(b);
  }
  document.getElementById("insbarsheet").classList.add("on");
}
document.getElementById("insgo").addEventListener("click", () => {
  const bt = barTicks(), qt = beatTicks();
  const b = Math.max(1, Math.round(+document.getElementById("insb").value || 1));
  const q = Math.max(1, +document.getElementById("insq").value || 1);
  const n = Math.max(1, Math.round(+document.getElementById("insn").value || 1));
  const T = Math.round((b - 1) * bt + (q - 1) * qt);
  const delta = n * (S.insUnit === "bars" ? bt : S.insUnit === "beats" ? qt : qt / 4);
  const k = insertTime(T, Math.round(delta));
  document.getElementById("insbarsheet").classList.remove("on");
  setInfo(k ? "inserted " + n + " " + S.insUnit + " at " + b + "." + q + " — " + k + " things moved (one undo undoes)"
            : "nothing to insert into — is this song editable?");
});
document.getElementById("insclose").addEventListener("click", () =>
  document.getElementById("insbarsheet").classList.remove("on"));
function openDeleteBars() {
  const bt = barTicks();
  document.getElementById("delb").value = Math.floor(S.playCursor / bt) + 1;
  document.getElementById("deln").value = 1;
  document.getElementById("delbarsheet").classList.add("on");
}
document.getElementById("delgo").addEventListener("click", () => {
  const bt = barTicks();
  const fromBar = Math.max(1, Math.round(+document.getElementById("delb").value || 1));
  const n = Math.max(1, Math.round(+document.getElementById("deln").value || 1));
  const r = deleteTime((fromBar - 1) * bt, n * bt);
  document.getElementById("delbarsheet").classList.remove("on");
  const where = n > 1 ? ("bar " + fromBar + "–" + (fromBar + n - 1)) : ("bar " + fromBar);
  setInfo(r ? where + " removed — everything after moved " + n + " bar" + (n === 1 ? "" : "s") + " earlier" +
               (r.movedToT ? "; " + r.movedToT + " annotation" + (r.movedToT === 1 ? "" : "s") + " moved to bar " + fromBar : "")
            : "nothing to delete from — is this song editable?");
});
document.getElementById("delclose").addEventListener("click", () =>
  document.getElementById("delbarsheet").classList.remove("on"));
             if (typeof document !== "undefined" && document.getElementById("jobsbtn")) {
  document.getElementById("jobsbtn").addEventListener("click", () => { renderJobs(); document.getElementById("jobssheet").classList.add("on"); });
  document.getElementById("jobsclear").addEventListener("click", () => { jobsClearFinished(); renderJobs(); });
  document.getElementById("pubjobcancel").addEventListener("click", () => { if (S.pubJobShown) jobCancel(S.pubJobShown); renderPubJob(); });
  document.getElementById("pubjobclose").addEventListener("click", () => document.getElementById("pubjobsheet").classList.remove("on"));
  jobsOnChange(() => {
    if (document.getElementById("jobssheet").classList.contains("on")) renderJobs();
    if (document.getElementById("pubjobsheet").classList.contains("on")) renderPubJob();
  });
}
window.addEventListener("error", e => {
  if (BENIGN_ERRORS.test(e.message || "")) return;
  logErr("uncaught: " + e.message + (e.filename ? " (" + (e.filename.split("/").pop()) + ":" + e.lineno + ")" : ""));
});
window.addEventListener("unhandledrejection", e =>
  logErr("unhandled: " + (e.reason && e.reason.message || e.reason)));
document.getElementById("errbtn").addEventListener("click", () => {
  const lines = logLines();
  const max = askSeenMax().err; // Mark-as-read (2026-09-30): grey out lines already included in a "New since…" bridge context block, in ANY chat
  const list = document.getElementById("errlist");
  list.innerHTML = "";
  if (!lines.length) list.textContent = "No messages.";
  else for (const x of lines.slice().reverse()) {
    const d = document.createElement("div");
    d.style.marginBottom = "0.6em";
    d.textContent = logLine(x);
    if (x.id <= max) d.style.color = "var(--dim)";
    list.appendChild(d);
  }
  document.getElementById("errsheet").classList.add("on");
});
document.getElementById("errcopy").addEventListener("click", async () => { // the whole log, newest first, for pasting to Claude (Josh, 2026-09-27) — built from the data, not the rendered DOM (errlist is now one div per line, so its own textContent runs the lines together)
  const text = logLines().slice().reverse().map(logLine).join("\n\n") || "No messages.";
  const b = document.getElementById("errcopy");
  try { await navigator.clipboard.writeText(text); b.textContent = "Copied ✓"; }
  catch (err) { b.textContent = "⚠ couldn't copy"; }
  setTimeout(() => { b.textContent = "Copy all"; }, 1500);
});
document.getElementById("errclear").addEventListener("click", () => {
  appErrors.length = 0; appDebug.length = 0;
  document.getElementById("errbtn").style.display = "none";
  document.getElementById("errsheet").classList.remove("on");
});
 document.getElementById("noteinfo").addEventListener("click", async () => {
  if (!S.infoCopyText) { // no copy action on this message: the tap reveals it in full instead
    if (S.infoFull) {
      document.getElementById("infosheettext").textContent = S.infoFull;
      document.getElementById("infosheet").classList.add("on");
    }
    return;
  }
  let ok = true;
  try { await navigator.clipboard.writeText(S.infoCopyText); }
  catch (err) { // clipboard API denied: fall back to a hidden textarea
    try {
      const ta = document.createElement("textarea");
      ta.value = S.infoCopyText;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select(); ok = document.execCommand("copy");
      ta.remove();
    } catch (err2) { ok = false; }
  }
  const chip = document.querySelector("#noteinfo .copychip");
  if (chip) chip.textContent = ok ? "✓ copied" : "✗ copy failed";
});
// the Status window itself (#infosheet) had no way to copy its text at all
// (Josh, 2026-09-30: "I can't copy from the Status window") — the info strip
// already copies SOME messages (infoCopyText above); this covers the rest.
document.getElementById("infosheetcopy").addEventListener("click", ev => {
  ev.stopPropagation();
  askCopyText(S.infoFull || document.getElementById("infosheettext").textContent, document.getElementById("infosheetcopy"));
});

  // iOS Safari ignores user-scalable=no: kill page-level pinch zoom explicitly,
// or a missed gesture zooms the whole page and hides the footer.
for (const ev of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(ev, e => e.preventDefault(), {passive: false});
}
document.addEventListener("touchmove", e => {
  if (e.touches.length > 1) e.preventDefault();
}, {passive: false});
document.addEventListener("touchend", e => {
  const now = Date.now();
  if (now - S.lastTapEnd < 350 && !e.target.closest("button, select, input, textarea, a"))
    e.preventDefault();
  S.lastTapEnd = now;
}, {passive: false, capture: true});

canvas.addEventListener("pointerdown", e => {
  if (fallActive() && !S.lassoMode) return; // fall rides the playhead — no pan/zoom; lasso still works
  // a PRIMARY pointer starts a new gesture: whatever an earlier one left
  // behind (a lift the canvas never heard) is gone. A stale drag made the next
  // touch a "second finger", so every drag zoomed (Josh, 2026-09-30, on his
  // iPad: "dragging only controls zoom"; couldn't lasso or range)
  // palm rejection: while the Pencil is down, a touch is the hand resting on
  // the glass, not a second finger for a pinch (checked first — a palm is
  // "primary" too: isPrimary is per pointer type)
  if (S.drag && S.drag.ptype === "pen" && e.pointerType === "touch") return;
  if (e.isPrimary && (S.pinch || (S.drag && S.drag.ptype === e.pointerType))) { logDebug("gesture: cleared a stale " + (S.pinch ? "pinch" : "drag") + " on a new touch"); clearTimeout(S.drag && S.drag.holdTimer); S.drag = null; S.pinch = null; }
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {} // Safari can refuse mid-gesture
  if (S.pinch) return; // third finger: ignore
  if (S.drag && S.drag.id !== e.pointerId) {
    clearTimeout(S.drag.holdTimer);
    // the first finger wasn't a scroll after all — undo whatever it started
    // (a second finger means "pan/zoom", even with pencil or select armed)
    if (S.drag.pencil && !S.drag.pencil.existing) { // remove the just-penciled note and its undo entry
      const pn = S.drag.pencil;
      S.song.tracks[pn.ti].notes.splice(pn.ni, 1);
      if (S.song.rawNotes) S.song.rawNotes[pn.ti].pop();
      const u = S.editUndo[S.editUndo.length - 1];
      if (u && u.kind === "add" && u.ti === pn.ti && u.ni === pn.ni) S.editUndo.pop();
    }
    if (S.drag.noteEdit) { // put every grabbed note back where it was
      S.drag.noteEdit.items.forEach((it, i) => {
        const o = S.drag.noteEdit.orig[i];
        it.n.t = o.t; it.n.d = o.d; it.n.p = o.p;
      });
    }
    if (S.drag.bandEdge) { // restore the band's original span
      const be = S.drag.bandEdge;
      setAnchorBQ(be.n, be.s0);
      setEndBQ(be.n, be.e0);
      resolveNote(be.n);
    }
    S.lassoRect = null;
    S.pinch = {a: {id: S.drag.id, x: S.drag.x, y: S.drag.y},
             b: {id: e.pointerId, x: e.clientX, y: e.clientY},
             pxq: S.view.pxq, vx: S.view.x, rowH0: S.view.rowH, vy: S.view.y};
    S.pinch.dx0 = Math.abs(S.pinch.a.x - S.pinch.b.x);
    S.pinch.dy0 = Math.abs(S.pinch.a.y - S.pinch.b.y);
    S.pinch.mid0x = (S.pinch.a.x + S.pinch.b.x) / 2 - S.RULER_W; // fixed anchor: parallel fingers PAN
    S.pinch.mid0y = (S.pinch.a.y + S.pinch.b.y) / 2 - S.RULER_H;
    S.drag = null;
    return;
  }
  const p = evtPos(e);
  // a mouse press is deliberate; so is an Apple Pencil touch (iPadOS habit:
  // the pen draws, fingers navigate — 2026-09-29; device pref, default on).
  // A finger still dwells: a fast finger stroke pans
  const instantGrab = e.pointerType === "mouse" || (e.pointerType === "pen" && penInstant());
  let lasso = S.lassoMode && !!S.song && (fallActive() || p.y >= S.RULER_H); // the playhead's tag sits in the strip, above where a lasso can start
  let noteEdit = null, pendingEdit = null;
  // a drag that STARTS on a selected note moves the selection even in lasso
  // mode (drag from empty space still draws a box; a tap still toggles)
  if (editableSong() && (S.mode === "select" || lasso) && S.viewMode !== "score" && !fallActive() && p.y >= S.RULER_H) {
    const hit = S.viewMode === "tracks" ? hitTracksNote(p) : hitNote(p);
    const hitKey0 = hit ? hit.ti + ":" + hit.ni : null;
    const wasSelected = !!hit && S.multiSelKey.has(hitKey0);
    if (hit && !lasso && S.multiSel.length && !wasSelected) {
      // grabbing a note OUTSIDE the selection reselects just it (Logic
      // behavior) — but only when the grab actually ARMS (below), so a fast
      // pan across notes never churns the selection (Josh, 2026-08-24)
      S.selNote = hit;
    }
    if (hit && (wasSelected || !lasso)) {
      if (!S.multiSel.length) S.selNote = hit; // single note is draggable too
      gridFollowNote(S.song.tracks[hit.ti].notes[hit.ni]); // before any move math reads the grid
      if (e.altKey) duplicateSelectionInPlace(); // option-drag = drag out a copy
      const items = wasSelected || !S.multiSel.length ? selEditItems()
        : [{ti: hit.ti, ni: hit.ni, n: S.song.tracks[hit.ti].notes[hit.ni]}];
      if (items.length) {
        const hn = S.song.tracks[hit.ti].notes[hit.ni];
        const tickHere = posToTickPitch(p).tick;
        const edgeOk = hn.d * pxPerTick() >= 24 && !e.altKey; // tiny notes are all move handle
        const nearEnd = edgeOk && Math.abs(tickHere - (hn.t + hn.d)) < 8 / pxPerTick();
        const nearStart = edgeOk && !nearEnd && Math.abs(tickHere - hn.t) < 8 / pxPerTick();
        pendingEdit = {kind: nearEnd ? "resize" : nearStart ? "resizeL" : "move",
                       orig: items.map(({ti, ni, n: nn}) => ({ti, ni, t: nn.t, d: nn.d, p: nn.p})),
                       items, hitKey: hitKey0, reselect: !wasSelected};
        // a SELECTED note grabs instantly for every pointer — tap once, then
        // drag; the dwell is only for cold grabs (Josh: "way too damn hard")
        if (instantGrab || wasSelected) { armNoteEdit(pendingEdit); noteEdit = pendingEdit; pendingEdit = null; }
        lasso = false;
      }
    }
  }
  // a clip slides in time like a note — in Select mode only, like a note: with no
  // tool armed a drag over it pans (Josh, 2026-09-16: a pan moved his take to bar 5)
  if (editableSong() && S.mode === "select" && S.viewMode === "tracks" && !noteEdit && !pendingEdit && !lasso && p.y >= S.RULER_H && p.x >= S.RULER_W) {
    const ch = hitTracksClip(p); // selected = instant grab, cold = dwell; edges trim, the body moves
    if (ch) {
      const wasSel = selClipIs(ch.ti, ch.ci);
      pendingEdit = {kind: wasSel ? ch.zone : "clip", ti: ch.ti, ci: ch.ci, items: [], orig: [], reselect: false}; // edges only on a selected piece
      if (instantGrab || wasSel) { noteEdit = pendingEdit; pendingEdit = null; }
      S.selClip = {ti: ch.ti, ci: ch.ci};
    }
  }
  if (S.viewMode === "tracks" && p.x < S.RULER_W && p.y >= S.RULER_H && S.song) { // lane header column
    const ti = trackLaneAt(p.y);
    if (ti >= 0) {
      const g = laneGeom(ti);
      const ly = p.y - g.y0;
      if (ly >= 22 && ly <= 42 && p.x >= 8 && p.x <= 30) { // M
        trackToggle(ti, "muted");
        S.drag = null; return;
      }
      if (ly >= 22 && ly <= 42 && p.x >= 34 && p.x <= 56) { // S
        trackToggle(ti, "solo");
        S.drag = null; return;
      }
      if (g.lh >= 56 && ly >= 22 && ly <= 42 && p.x >= 56 && p.x <= 126) { // fader
        S.drag = {id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
                moved: false, trFader: {ti}, spos: p};
        return;
      }
      S.drag = {id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
              moved: false, trHeader: {ti}, spos: p};
      return;
    }
  }
  if (S.viewMode === "roll" && p.x < S.RULER_W && p.y >= S.RULER_H && songHasDrums()) { // grab the lane by its gutter labels
    const row = topRow() - Math.floor((p.y - S.RULER_H + S.view.y) / S.view.rowH);
    if (inKitLane(row)) {
      S.drag = {id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
              moved: false, lane: {y0: e.clientY, top0: kitLaneTop()}, spos: p};
      return;
    }
  }
  let pencil = null, pendingPencil = null; // pencil-drag: note at finger-down, stretch as you drag
  if (editableSong() && S.mode === "pencil" && S.viewMode === "roll" && !fallActive() && !lasso && p.y >= S.RULER_H) {
    const {tick, pitch: row} = posToTickPitch(p);
    const kit = trackIsDrums(S.selTrack);
    const li = kitLaneTop() - row; // lane slot index when the tap lands in the docked lane
    const pitch = kit ? (li >= 0 && li < kitSlots().length ? kitSlots()[li] : -1)
                      : (row >= S.PMIN && row <= S.PMAX && !inKitLane(row) ? row : -1);
    if (pitch >= (kit ? 0 : S.PMIN) && pitch <= 127 && tick >= 0) {
      const snap = S.gridDiv ? moveSnapTicks() : pencilTicks(); // custom grid: a tap = one cell
      const t = gridCellStart(tick); // the CELL you touch, not the nearest line —
      // tapping mid-gap between two notes lands the note IN the gap (rounding made only edges work)
      pendingPencil = {pitch, t, snap}; // created on dwell or a clean tap — never by a fast stroke
      if (instantGrab) pencil = placePencilNote(pendingPencil), pendingPencil = null;
    }
  }
  // Grab a section/chord band by its edge (roll view, any song). This used to
  // require editableSong(), which conflated "the MIDI is editable" with "this
  // annotation is mine" — so Josh could not adjust a section boundary on an
  // FF1 song, the songs he annotates most (2026-08-25). A band lives in the
  // .rollnotes sidecar; dragging it touches zero MIDI bytes, and the drop path
  // is the same finalizeNotes + saveLocalNotes his FF1 notes already use.
  let bandEdge = null;
  if (S.song && S.viewMode !== "score" && !fallActive() && !noteEdit && !pencil &&
      p.y >= BASE_RULER_H && p.y < S.STRIP_Y) { // the band rows only — not the playhead strip below them
    const laneAt = Math.floor((p.y - BASE_RULER_H) / LANE_H);
    const tk = posToTickPitch(p).tick, ppt = pxPerTick();
    const band = S.rollnotes.find(n => (n.section || n.chord) && n.lane === laneAt &&
      (Math.abs((n.start - tk) * ppt) < 10 || Math.abs((n.end - tk) * ppt) < 10));
    if (band) bandEdge = {n: band,
      side: Math.abs((band.end - tk) * ppt) <= Math.abs((band.start - tk) * ppt) ? "end" : "start",
      s0: band.start, e0: band.end, pre: annoSnapshot()};
  }
  let rangeEdge = null; // grab the cycle highlight by an END and stretch it
  if (!lasso && !noteEdit && !pendingEdit && !pencil && !pendingPencil && !bandEdge &&
      S.song && p.y < BASE_RULER_H && S.rangeSel && S.rangeSel.b > S.rangeSel.a && S.viewMode !== "score") {
    const ppt = pxPerTick();
    const ax = S.RULER_W + S.rangeSel.a * ppt - S.view.x, bx = S.RULER_W + S.rangeSel.b * ppt - S.view.x;
    if (Math.abs(p.x - bx) < 12) rangeEdge = "b";
    else if (Math.abs(p.x - ax) < 12) rangeEdge = "a";
  }
  const plain = !lasso && !noteEdit && !pendingEdit && !pencil && !pendingPencil && !bandEdge && !rangeEdge;
  // a press ON the playhead (its tag in the strip, any mode, even while
  // playing; or its line through the notes at rest, select mode) — a cursor
  // drag, which is the strip's scrub with one difference: let go without
  // moving and the cursor stays put (a strip tap would snap it to an 8th)
  const onCursor = plain && cursorHit(p);
  S.drag = {id: e.pointerId, ptype: e.pointerType, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false,
          lasso, noteEdit, pencil, bandEdge, pendingEdit, pendingPencil, rangeEdge, onCursor,
          ruler: plain && !!S.song && p.y < BASE_RULER_H,
          // the playhead strip, between the ruler/bands and the notes (Josh,
          // 2026-10-03): tap moves the cursor, drag scrubs — NEVER touches
          // rangeSel (that's the whole point — the ruler above still parks
          // it). No viewMode exclusion: same linear-tick approximation the
          // ruler's own tap/drag already uses in Score. Also the flag for a
          // grabbed playhead (onCursor) — one scrub path, one follow rule.
          stripCursor: onCursor || (plain && !!S.song && !fallActive() && p.y >= S.STRIP_Y && p.y < S.RULER_H),
          spos: p};
  if (pendingEdit || pendingPencil) { // hold-to-grab: dwell arms the edit; a fast stroke pans
    const d = S.drag;
    d.holdTimer = setTimeout(() => {
      // pending survives small jitter (moved flips at 8px, pending dies at
      // HOLD_SLOP) — only a real swipe or a finished gesture cancels the arm
      if (S.drag !== d || (!d.pendingEdit && !d.pendingPencil)) return;
      if (d.pendingEdit) {
        armNoteEdit(d.pendingEdit);
        d.noteEdit = d.pendingEdit; d.pendingEdit = null;
        // the dwell armed — SAY so, or moving a beat early silently pans instead
        // (Josh, 2026-08-22: "sometimes I did [hold] and it was still difficult")
        const k = d.noteEdit.items.length;
        setInfo("✊ grabbed " + k + " note" + (k === 1 ? "" : "s") + " — drag to move");
        previewNote(d.noteEdit.items[0].ti, d.noteEdit.items[0].n.p, d.noteEdit.items[0].n.t); // audible arm cue
      }
      else if (d.pendingPencil) { d.pencil = placePencilNote(d.pendingPencil); d.pendingPencil = null; }
      draw();
    }, HOLD_MS);
  }
});
canvas.addEventListener("pointermove", e => {
  if (S.pinch) {
    const pt = S.pinch.a.id === e.pointerId ? S.pinch.a : S.pinch.b.id === e.pointerId ? S.pinch.b : null;
    if (!pt) return;
    pt.x = e.clientX; pt.y = e.clientY;
    // per-axis zoom: horizontal finger spread scales time, vertical spread
    // scales pitch rows (roll only). PAD damps the axis the fingers are
    // nearly aligned on, so a one-axis pinch doesn't wobble the other.
    const PAD = 40;
    const sx = (Math.abs(S.pinch.a.x - S.pinch.b.x) + PAD) / (S.pinch.dx0 + PAD);
    const midX = (S.pinch.a.x + S.pinch.b.x) / 2 - S.RULER_W;
    const floorX = S.viewMode === "score" ? minPxq() : pxqFloor();
    const newPxq = Math.min(400, Math.max(floorX, S.pinch.pxq * sx));
    // anchored at the gesture's STARTING midpoint: spreading zooms around it,
    // moving both fingers together pans — so two fingers always scroll, even
    // with pencil or select armed (Josh, 2026-08-19: sweeping scrolls misfired)
    S.view.x = (S.pinch.vx + S.pinch.mid0x) * (newPxq / S.pinch.pxq) - midX;
    S.view.pxq = newPxq;
    if (S.viewMode !== "score" && newPxq === floorX) S.view.x = 0; // flush: bar 1 at the left edge
    if (S.viewMode === "roll") { // roll rows only — score staves and tracks lanes are fixed-height
      const sy = (Math.abs(S.pinch.a.y - S.pinch.b.y) + PAD) / (S.pinch.dy0 + PAD);
      const midY = (S.pinch.a.y + S.pinch.b.y) / 2 - S.RULER_H;
      const floorY = rowHFloor();
      const newRowH = Math.min(32, Math.max(floorY, S.pinch.rowH0 * sy));
      S.view.y = (S.pinch.vy + S.pinch.mid0y) * (newRowH / S.pinch.rowH0) - midY;
      S.view.rowH = newRowH;
      if (newRowH === floorY) S.view.y = (topRow() - dispPitchExtent().hi - ROLL_AIR) * newRowH; // top row + air below the ruler
    }
    clampView(); draw();
    return;
  }
  if (!S.drag || S.drag.id !== e.pointerId) return;
  const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y;
  const trav = Math.abs(e.clientX - S.drag.sx) + Math.abs(e.clientY - S.drag.sy);
  if (trav > 8) S.drag.moved = true;
  if (trav > HOLD_SLOP && (S.drag.pendingEdit || S.drag.pendingPencil)) {
    S.drag.pendingEdit = S.drag.pendingPencil = null; // a real swipe, not pen jitter: it's a scroll
    clearTimeout(S.drag.holdTimer);
  }
  if (S.drag.moved) {
    if (S.drag.lasso) {
      const p = evtPos(e);
      S.lassoRect = {x0: S.drag.spos.x, y0: S.drag.spos.y, x1: p.x, y1: p.y};
      draw();
    }
    else if (S.drag.trFader) { // lane fader: live while dragging, persist on release
      const ti = S.drag.trFader.ti;
      const v = Math.max(0, Math.min(1.5, ((evtPos(e).x - 62) / 56) * 1.5));
      S.song.tracks[ti].vol = Math.abs(v - 1) < 0.04 ? undefined : Math.round(v * 100) / 100;
      updateTrackGains();
      draw();
    }
    else if (S.drag.lane) { // drag the kit lane anywhere; it pins there for this song
      const dRow = Math.round((S.drag.lane.y0 - e.clientY) / S.view.rowH);
      S.laneOverride = Math.min(S.PMAX - 4, Math.max(S.PMIN - 2, S.drag.lane.top0 + dRow));
      draw();
    }
    else if (S.drag.pencil && !S.drag.pencil.existing) { // stretch the just-penciled note under the finger, on the fine grid
      const pn = S.drag.pencil, nn = S.song.tracks[pn.ti].notes[pn.ni];
      const g = moveSnapTicks(); // 16ths (or triplet steps) — not the coarse tap length
      const tickHere = posToTickPitch(evtPos(e)).tick;
      nn.d = Math.max(g, Math.round((tickHere - pn.t) / g) * g);
      const rn = S.song.rawNotes && nn.ri !== undefined && S.song.rawNotes[pn.ti][nn.ri];
      if (rn) rn.d = nn.d;
      draw();
    }
    else if (S.drag.noteEdit) { // 16th grid — or triplet steps while a T duration is active
      const p = evtPos(e);
      const snap = moveSnapTicks();
      const dT = Math.round((p.x - S.drag.spos.x) / pxPerTick() / snap) * snap;
      if (S.drag.noteEdit.kind === "clip" || S.drag.noteEdit.kind === "clipL" || S.drag.noteEdit.kind === "clipR") {
        S.tracksGhost = {dT, dLane: 0, zone: S.drag.noteEdit.kind}; // ghost only; the annotation rewrites on release
        draw();
      }
      else if (S.drag.noteEdit.kind === "move" && S.viewMode === "tracks") {
        // arrange drag is a GHOST — commit on release (live retrack would churn
        // the {ti,ni} selection under our feet; advisor's structural ruling)
        const snap = moveSnapTicks();
        const dT = Math.round((p.x - S.drag.spos.x) / pxPerTick() / snap) * snap;
        let dLane = Math.round((p.y - S.drag.spos.y) / tracksLaneH());
        const fromTi = S.drag.noteEdit.items[0].ti;
        const tgt = fromTi + dLane;
        if (tgt < 0 || tgt >= S.song.tracks.length ||
            trackIsDrums(tgt) !== trackIsDrums(fromTi) ||
            S.song.tracks[tgt].kind === "audio") dLane = 0; // compatible lanes only; notes never land in a clip lane
        S.tracksGhost = {dT, dLane};
        draw();
      }
      else if (S.drag.noteEdit.kind === "move") {
        const dP = Math.round((S.drag.spos.y - p.y) / S.view.rowH);
        // absolute snap: the GRABBED note lands ON grid lines (an off-phase
        // note — born on a custom grid — could never reach the "and of 1" by
        // relative steps; Josh, 2026-08-24); mates keep their offsets
        const gi = S.drag.noteEdit.orig.findIndex((o, i) => {
          const it = S.drag.noteEdit.items[i]; return it.ti + ":" + it.ni === S.drag.noteEdit.hitKey;
        });
        const go = S.drag.noteEdit.orig[gi] || S.drag.noteEdit.orig[0];
        const dTr = (p.x - S.drag.spos.x) / pxPerTick();
        const dMove = snapTickAbs(go.t + dTr) - go.t;
        for (let i = 0; i < S.drag.noteEdit.items.length; i++) {
          const it = S.drag.noteEdit.items[i], o = S.drag.noteEdit.orig[i];
          it.n.t = Math.max(0, o.t + dMove);
          it.n.p = trackIsDrums(it.ti) ? drumStep(o.p, -dP) // lane rows run opposite to slot order
                                       : Math.min(S.PMAX, Math.max(S.PMIN, o.p + dP));
        }
      } else if (S.drag.noteEdit.kind === "resizeL") { // left edge: end stays put
        const minD = Math.max(24, Math.round(S.song.ppq / 8));
        const gi = S.drag.noteEdit.orig.findIndex((o, i) => {
          const it = S.drag.noteEdit.items[i]; return it.ti + ":" + it.ni === S.drag.noteEdit.hitKey;
        });
        const go = S.drag.noteEdit.orig[gi] || S.drag.noteEdit.orig[0];
        const edgeT = Math.round((go.t + dT) / snap) * snap; // absolute: land ON lines
        const dEdge = edgeT - go.t;
        for (let i = 0; i < S.drag.noteEdit.items.length; i++) {
          const it = S.drag.noteEdit.items[i], o = S.drag.noteEdit.orig[i];
          const nt = Math.max(0, Math.min(o.t + dEdge, o.t + o.d - minD));
          it.n.t = nt;
          it.n.d = o.d + (o.t - nt);
        }
      } else {
        const minD = Math.max(24, Math.round(S.song.ppq / 8));
        const gi = S.drag.noteEdit.orig.findIndex((o, i) => {
          const it = S.drag.noteEdit.items[i]; return it.ti + ":" + it.ni === S.drag.noteEdit.hitKey;
        });
        const go = S.drag.noteEdit.orig[gi] || S.drag.noteEdit.orig[0];
        const edgeT = Math.round((go.t + go.d + dT) / snap) * snap; // absolute: land ON lines
        const dEdge = edgeT - (go.t + go.d);
        for (let i = 0; i < S.drag.noteEdit.items.length; i++) {
          const it = S.drag.noteEdit.items[i], o = S.drag.noteEdit.orig[i];
          it.n.d = Math.max(minD, o.d + dEdge);
        }
      }
      draw();
    }
    else if (S.drag.rangeEdge) { // stretch the cycle by its end — bar-magnetic, stays armed
      const tk = rulerSnapX(evtPos(e).x);
      const min16 = Math.round(S.song.ppq / 4);
      if (S.drag.rangeEdge === "a") S.rangeSel.a = Math.max(0, Math.min(tk, S.rangeSel.b - min16));
      else S.rangeSel.b = Math.max(tk, S.rangeSel.a + min16);
      S.rangeSel.off = false; // stretching re-arms a parked cycle
      draw();
    }
    else if (S.drag.bandEdge) {
      const be = S.drag.bandEdge, n = be.n;
      const tk = tickAtX(evtPos(e).x, Math.round(S.song.ppq / 4)); // 16ths, like ruler selects
      if (be.side === "end") setEndBQ(n, Math.max(be.s0 + beatTicks(), tk));
      else setAnchorBQ(n, Math.min(Math.max(0, tk), be.e0 - beatTicks()));
      resolveNote(n);
      draw();
    }
    else if (S.drag.stripCursor) scrubTo(evtPos(e));
    else if (S.drag.ruler) { // drag along the ruler = select a beat range
      // a finger placing the cursor wobbles past the 8px "moved" mark; under
      // RULER_RANGE_SLOP it is still that tap, not a 16th-note cycle (Josh,
      // 2026-10-02: "I'm always accidentally selecting a 16th note … then
      // press play and it loops back-and-forth super fast")
      if (!S.drag.rulerRange && Math.abs(evtPos(e).x - S.drag.spos.x) < RULER_RANGE_SLOP) return;
      S.drag.rulerRange = true;
      const a = rulerSnapX(S.drag.spos.x);
      const b = rulerSnapX(evtPos(e).x);
      S.rangeSel = a === b ? null : {a: Math.min(a, b), b: Math.max(a, b), cycle: true}; // drags arm the cycle
      draw();
    }
    else { S.view.x -= dx; S.view.y -= dy; S.followFree = true; clampView(); draw(); }
  }
  S.drag.x = e.clientX; S.drag.y = e.clientY;
});
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", () => { S.drag = null; S.pinch = null; draw(); });
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const mid = evtPos(e).x - S.RULER_W;
    const floorX = S.viewMode === "score" ? minPxq() : pxqFloor();
    const newPxq = Math.min(400, Math.max(floorX, S.view.pxq * (e.deltaY < 0 ? 1.1 : 0.9)));
    S.view.x = (S.view.x + mid) * (newPxq / S.view.pxq) - mid;
    S.view.pxq = newPxq;
    if (S.viewMode !== "score" && newPxq === floorX) S.view.x = 0;
  } else { S.view.x += e.deltaX; S.view.y += e.deltaY; }
  S.followFree = true;
  clampView(); draw();
}, {passive: false});
 

 if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("touchstart", () => {}, {passive: true});
document.addEventListener("visibilitychange", async () => {
  if (document.hidden || !S.audio || S.audio.state === "closed" || S.wakeInFlight) return; // a closed one waits for the tap
  if (S.playing && S.audio.state === "running") return;
  // idle: back to the mixing session BEFORE the wake. A tap, ▶ or the click
  // left "playback" behind if the app was hidden when it ended (every revert
  // skips a hidden page), and resuming the context under "playback" stopped
  // YouTube the moment Josh switched back in (2026-10-02)
  if (!S.playing && !S.albumRun && !met.on) audioSessionType("ambient");
  S.wakeInFlight = true;
  try { await resumeAudio(); } finally { S.wakeInFlight = false; }
});
// first touch anywhere: create + warm the context inside a user gesture
// ?perf=1 — on-device performance HUD (iPad has no Activity Monitor): fps,
// worst frame gap, long-task count/max over the last second. ⏺ records a
// session and prints a report Josh can copy out — the iPad has no profiler,
// so attribution has to come from the app's own instrumentation.
if (typeof location !== "undefined" && document.body && new URLSearchParams(location.search).get("perf")) (() => {
  const el = document.createElement("div");
  // right:8px from the viewport would sit under the right dock (window
  // manager, build steps 1-2) when it's open — offset from the song
  // region's own right edge instead, same 8px gutter
  el.style.cssText = "position:fixed;right:" + (window.innerWidth - songRegionRight() + 8) + "px;bottom:64px;z-index:9999;background:rgba(0,0,0,.75);" +
    "color:#7fdc7f;font:11px monospace;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre";
  document.body.appendChild(el);
  let frames = 0, worst = 0, last = performance.now(), longs = 0, longMax = 0;
  let lagWorst = 0, lagExp = performance.now() + 50;
  setInterval(() => { const n = performance.now(); // event-loop stall probe: fires
    lagWorst = Math.max(lagWorst, n - lagExp);     // even when rAF is throttled
    lagExp = n + 50; }, 50);
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries()) { longs++; longMax = Math.max(longMax, e.duration); } })
      .observe({entryTypes: ["longtask"]});
  } catch (err) { /* webkit: no longtask — fps + gap still tell the story */ }
  // frame-delta histogram: separates "uniformly throttled" (one fat bucket)
  // from "mostly fine with spikes" (bimodal) — the two have different causes
  const BUCKETS = [8, 17, 25, 34, 50, 100, 200, Infinity];
  const hist = BUCKETS.map(() => 0);
  // S.perfRec (src/state.js): null when idle, else the in-flight recording
  // session object. Was a closure-local `rec` here; prof() (which now runs
  // from wherever each profiled function is actually defined, not from
  // inside this HUD) needs to read/write the exact same flag, so it moved
  // to S.
  // loop-wrap detection without touching app code: playSec() runs backwards
  // when the transport wraps a cycle. If the stalls land ON wraps it is the
  // transport's re-schedule; if they land anywhere, it is GC or the platform.
  let prevSec = null, lastWrap = -1e9;
  const loop = t => {
    frames++;
    const dt = t - last;
    worst = Math.max(worst, dt);
    last = t;
    if (S.perfRec) {
      S.perfRec.frames++;
      hist[BUCKETS.findIndex(b => dt <= b)]++;
      try {
        const ps = typeof S.playing !== "undefined" && S.playing ? playSec() : null;
        if (ps !== null && prevSec !== null && ps < prevSec - 0.05) { S.perfRec.wraps++; lastWrap = t; }
        prevSec = ps;
      } catch (err) { /* transport not running: wrap census simply stays empty */ }
      if (dt > 50) { // a stall worth attributing
        S.perfRec.blocks++;
        S.perfRec.blockMs += dt;
        if (t - lastWrap < 250) S.perfRec.blocksAtWrap++;
        S.perfRec.secBlocks++;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // self-profiler: WebKit has no longtask attribution — wrap the app's own
  // hot functions and report top offenders (ms spent in the last second)
  const acct = S.perfAcct;   // rolling, cleared every second for the HUD line — shared with prof() (src/state.js)
  const total = S.perfTotal;  // session totals: {ms, calls} — shared with prof() (src/state.js)
  // self-profiler (step 7, docs/split-plan.md §2.4): each profiled function
  // now wraps ITSELF at its own definition site via prof() (src/state.js —
  // "name = prof(\"name\", name);", right after the function declaration,
  // wherever that declaration now lives). The old wrap() installed this
  // centrally by patching globalThis[name], which only ever worked while
  // every profiled name was a classic <script> global; the first function
  // this step moved out of app.js (secToTick, step 3) silently broke it —
  // attribution kept reporting nothing, with no error. acct/total below are
  // the SAME shared objects prof()'s wrapped calls write into (S.perfAcct/
  // S.perfTotal), not a fresh local pair, so this HUD still reads them live.
  // second pass: the edit entry points also mark the timeline, so the report
  // shows the exact second an edit landed and what it changed
  setTimeout(() => ["saveEdits", "selEditApply", "insertTime"].forEach(name => {
    const fn = typeof globalThis[name] === "function" ? globalThis[name] : null;
    if (!fn) return;
    globalThis[name] = function () {
      const r = fn.apply(this, arguments);
      if (S.perfRec) S.perfRec.marks.push("  ==== EDIT (" + name + ") @" + S.perfRec.sec + "s  " + snapshot());
      return r;
    };
  }), 1);
  // audio-node census: a leaked graph costs time in the realtime render thread,
  // where no page-side profiler can see it. Patched on the prototype so the
  // app's own code stays untouched; 'ended' via addEventListener so an app
  // .onended assignment is not clobbered.
  const nodes = {osc: 0, gain: 0, buf: 0, filt: 0, ended: 0, stopped: 0, disc: 0};
  let livePeak = 0;
  const liveNow = () => nodes.osc + nodes.buf - nodes.ended; // stop() and 'ended'
  // fire for the same node — counting both double-subtracts and reads negative
  try {
    const P = (typeof BaseAudioContext !== "undefined" ? BaseAudioContext : AudioContext).prototype;
    const src = (m, key) => {
      const f = P[m];
      if (!f) return;
      P[m] = function () {
        const n = f.apply(this, arguments);
        nodes[key]++;
        livePeak = Math.max(livePeak, liveNow());
        try {
          n.addEventListener("ended", () => { nodes.ended++; });
          const st = n.stop;
          if (st) n.stop = function () { nodes.stopped++; return st.apply(this, arguments); };
        } catch (err) { /* node type without stop/ended: creation count still counts */ }
        return n;
      };
    };
    src("createOscillator", "osc");
    src("createBufferSource", "buf");
    for (const [m, k] of [["createGain", "gain"], ["createBiquadFilter", "filt"]]) {
      const f = P[m];
      if (f) P[m] = function () { nodes[k]++; return f.apply(this, arguments); };
    }
    const dc = AudioNode.prototype.disconnect;
    AudioNode.prototype.disconnect = function () { nodes.disc++; return dc.apply(this, arguments); };
  } catch (err) { /* no WebAudio in this context: the rest of the report stands */ }
  // Josh's Safari recording: ff1-battle ran 131s with zero stalls in every
  // second, then graveyard-2 degraded from the second he edited a note and
  // never recovered. Per-frame JS is identical either side of that line, so
  // the edit changes the DATA. Snapshot what it changes, at the boundary.
  const snapshot = () => {
    const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (err) { return d; } };
    const all = g(() => S.song.tracks.reduce((a, t) => a + t.notes.length, 0), -1);
    const gone = g(() => S.song.tracks.reduce((a, t) => a + t.notes.filter(n => n.gone).length, 0), -1);
    const added = g(() => S.song.tracks.reduce((a, t) => a + t.notes.filter(n => n.added).length, 0), -1);
    return "notes " + all + " (gone " + gone + ", added " + added + ")" +
           "  roll " + g(() => S.rollnotes.length, -1) +
           "  sched " + g(() => S.schedEvents.length, -1) +
           "  undo " + g(() => S.editUndo.length, -1) + "/" + g(() => S.editRedo.length, -1) +
           "  sceneValid " + g(() => String(S.sceneValid), "?") +
           "  songEndTick " + g(() => Math.round(S.songEndTick), -1);
  };
  const dims = id => {
    const c = document.getElementById(id);
    return c ? c.width + "x" + c.height : "—";
  };
  const lsReport = () => {
    let bytes = 0, keys = 0;
    const per = [];
    try {
      for (const k of Object.keys(localStorage)) {
        const n = (k.length + (localStorage.getItem(k) || "").length) * 2; // UTF-16
        bytes += n; keys++; per.push([k, n]);
      }
    } catch (err) { return "unavailable"; }
    per.sort((a, b) => b[1] - a[1]);
    return Math.round(bytes / 1024) + " KB in " + keys + " keys; top: " +
      per.slice(0, 4).map(([k, n]) => k + " " + Math.round(n / 1024) + "KB").join(", ");
  };
  const report = () => {
    const secs = (performance.now() - S.perfRec.t0) / 1000;
    const L = [];
    L.push("NIGHT ROLL PERF REPORT");
    L.push("build " + (document.lastModified || "?") + "   session " + secs.toFixed(1) + "s");
    L.push("song at stop " + (typeof S.songKey !== "undefined" ? S.songKey : "?") +
           "   tracks " + (typeof S.song !== "undefined" && S.song ? S.song.tracks.length : 0) +
           "   notes " + (typeof S.song !== "undefined" && S.song
             ? S.song.tracks.reduce((a, t) => a + t.notes.filter(n => !n.gone).length, 0) : 0) +
           "   view " + (typeof S.viewMode !== "undefined" ? S.viewMode : "?") +
           "   playing " + (typeof S.playing !== "undefined" ? !!S.playing : "?"));
    L.push("ua " + navigator.userAgent);
    L.push("dpr " + (window.devicePixelRatio || 1) +
           "   win " + innerWidth + "x" + innerHeight +
           "   screen " + screen.width + "x" + screen.height);
    L.push("flags dpr=" + (PERF_FLAGS.get("dpr") || "off") +
           "  scene=" + (PERF_NOSCENE ? "0 (cache disabled)" : "on"));
    L.push("state at stop: " + snapshot());
    L.push("canvas roll " + dims("roll") + "   inst " + dims("instcanvas") +
           "   instOpen " + (typeof S.instOpen !== "undefined" ? S.instOpen : "?") +
           "   fall " + (typeof S.fallOn !== "undefined" ? S.fallOn : "?") +
           "   scene " + (typeof S.sceneCanvas !== "undefined" && S.sceneCanvas
             ? S.sceneCanvas.width + "x" + S.sceneCanvas.height : "none"));
    try {
      L.push("audio sr " + S.audio.sampleRate + "  baseLatency " +
             Math.round((S.audio.baseLatency || 0) * 1000) + "ms  state " + S.audio.state);
    } catch (err) { L.push("audio —"); }
    L.push("");
    L.push("--- frames ---");
    L.push("frames " + S.perfRec.frames + "   avg fps " + (S.perfRec.frames / secs).toFixed(1) +
           "   worst frame " + Math.round(S.perfRec.worst) + "ms   worst lag " + Math.round(S.perfRec.lag) + "ms");
    L.push("longtasks " + S.perfRec.longs + (S.perfRec.longMax ? " (max " + Math.round(S.perfRec.longMax) + "ms)" : ""));
    // the discriminator: a blocked main thread stalls the 50ms timer AND the
    // frame; a throttled rAF starves frames while the timer stays on time
    // average fps is the WRONG test: Josh's 271s recording averaged 56.9 while
    // stalling 185ms, because it ran clean for two minutes before degrading.
    // Judge by stall density and by whether the probe timer went late with it.
    const perMin = S.perfRec.blocks / Math.max(1, secs / 60);
    L.push("shape " + (S.perfRec.frames / secs < 20 && S.perfRec.lag < 50
        ? "frames starved, event loop on time — rAF THROTTLED (environment/backgrounded)"
      : perMin < 2 ? "healthy (no meaningful stalls)"
      : S.perfRec.lag > 100 ? "main thread BLOCKED — " + Math.round(perMin) + " stalls/min, probe timer late too"
      : "stalls present — " + Math.round(perMin) + "/min, probe timer on time (paint or compositor side)"));
    L.push("frame deltas  " + BUCKETS.map((b, i) =>
      (b === Infinity ? ">200" : "<=" + b) + ":" + hist[i]).join("  "));
    L.push("");
    const segs = Object.entries(S.perfRec.bySong);
    if (segs.length > 1) { // only interesting when a song switch actually happened
      L.push("--- per song (the A/B) ---");
      for (const [k, v] of segs)
        L.push(k.padEnd(46) + String(v.secs).padStart(4) + "s  avg fps " +
               (v.frames / v.secs).toFixed(1).padStart(6) +
               "  worst " + String(Math.round(v.worst)).padStart(4) + "ms" +
               "  lag " + String(Math.round(v.lag)).padStart(4) + "ms");
      L.push("NOTE: attribution below is the WHOLE session, not per song.");
      L.push("");
    }
    L.push("--- attribution (session totals) ---");
    const rows = Object.entries(total).sort((a, b) => b[1].ms - a[1].ms).filter(([, v]) => v.ms >= 1);
    if (!rows.length) L.push("(nothing measurable)");
    for (const [n, v] of rows)
      L.push(n.padEnd(20) + String(Math.round(v.ms)).padStart(7) + "ms " +
             String(Math.round(v.ms / (secs * 10))).padStart(4) + "%   calls " + v.calls);
    L.push("NOTE: drawFull nests inside playbackFrame — percentages overlap.");
    L.push("");
    L.push("--- audio nodes ---");
    L.push("created osc " + nodes.osc + "  buf " + nodes.buf + "  gain " + nodes.gain +
           "  filt " + nodes.filt);
    L.push("ended " + nodes.ended + "  stopped " + nodes.stopped + "  disconnect " + nodes.disc +
           "   live(est) " + liveNow() + "   peak " + livePeak);
    L.push("");
    L.push("--- stalls (>50ms frames) ---");
    L.push("count " + S.perfRec.blocks + "   mean " +
           (S.perfRec.blocks ? Math.round(S.perfRec.blockMs / S.perfRec.blocks) : 0) + "ms" +
           "   loop wraps " + S.perfRec.wraps +
           "   stalls within 250ms of a wrap " + S.perfRec.blocksAtWrap +
           (S.perfRec.blocks ? " (" + Math.round(S.perfRec.blocksAtWrap / S.perfRec.blocks * 100) + "%)" : ""));
    L.push("read: high % = the transport's loop re-schedule; low % = GC/platform.");
    L.push("");
    L.push("--- growth (first vs last, and the slope) ---");
    if (S.perfRec.growth.length > 1) {
      const a = S.perfRec.growth[0], b = S.perfRec.growth[S.perfRec.growth.length - 1];
      const span = Math.max(1, b.s - a.s);
      for (const k of ["dom", "nodes", "live", "sched", "roll", "undo"])
        L.push(k.padEnd(8) + String(a[k]).padStart(8) + " -> " + String(b[k]).padStart(8) +
               "   " + ((b[k] - a[k]) / span).toFixed(1) + "/s");
      L.push("(nodes is cumulative and SHOULD climb; live/dom/sched/roll/undo should not)");
    } else L.push("(too short)");
    L.push("");
    L.push("--- storage ---");
    L.push(lsReport());
    L.push("");
    L.push("--- per second (fps / worst / lag / hottest) ---");
    for (const s of S.perfRec.marks) L.push(s);
    return L.join("\n");
  };
  const sheet = text => {
    const bg = document.createElement("div");
    bg.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.85);" +
      "display:flex;flex-direction:column;gap:8px;padding:12px;box-sizing:border-box";
    const ta = document.createElement("textarea");
    ta.readOnly = true;
    ta.value = text;
    ta.style.cssText = "flex:1;width:100%;box-sizing:border-box;background:#111;color:#7fdc7f;" +
      "font:11px monospace;border:1px solid #444;border-radius:6px;padding:8px";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px";
    const mk = (label, fn) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "flex:1;padding:10px;font:13px monospace;background:#222;color:#eee;" +
        "border:1px solid #555;border-radius:6px";
      b.addEventListener("click", fn);
      return b;
    };
    row.append(mk("Copy", () => {
      ta.select();
      const done = () => { row.firstChild.textContent = "Copied ✓"; };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {
        try { document.execCommand("copy"); done(); } catch (err) {}
      });
      else { try { document.execCommand("copy"); done(); } catch (err) {} }
    }), mk("Close", () => bg.remove()));
    bg.append(ta, row);
    document.body.appendChild(bg);
  };
  const btn = document.createElement("button");
  // same right-dock offset as the HUD panel above
  btn.style.cssText = "position:fixed;right:" + (window.innerWidth - songRegionRight() + 8) + "px;bottom:8px;z-index:9999;background:rgba(0,0,0,.8);" +
    "color:#e66767;font:13px monospace;padding:8px 12px;border-radius:6px;border:1px solid #555";
  btn.textContent = "⏺ rec";
  btn.addEventListener("click", () => {
    if (S.perfRec) { const t = report(); S.perfRec = null; btn.textContent = "⏺ rec"; btn.style.color = "#e66767"; sheet(t); return; }
    hist.fill(0);
    for (const k in total) delete total[k];
    for (const k in nodes) nodes[k] = 0;
    livePeak = 0;
    S.perfRec = {t0: performance.now(), frames: 0, worst: 0, lag: 0, longs: 0, longMax: 0,
           marks: [], sec: 0, bySong: {}, song: null,
           wraps: 0, blocks: 0, blockMs: 0, blocksAtWrap: 0, secBlocks: 0, growth: []};
    btn.textContent = "⏹ stop";
    btn.style.color = "#7fdc7f";
  });
  document.body.appendChild(btn);
  setInterval(() => {
    const entries = Object.entries(acct).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 3).map(([n, ms]) => n + " " + Math.round(ms)).join("  ");
    el.textContent = "fps " + frames + "  worst " + Math.round(worst) + "ms  lag " + Math.round(lagWorst) + "ms\n" +
                     "longtasks " + longs + (longMax ? " (max " + Math.round(longMax) + "ms)" : "") +
                     "\nhot: " + (top || "—") +
                     "\nbuild " + (document.lastModified || "?") +
                     (S.perfRec ? "\nREC " + Math.round((performance.now() - S.perfRec.t0) / 1000) + "s" : "");
    if (S.perfRec) {
      S.perfRec.sec++;
      S.perfRec.worst = Math.max(S.perfRec.worst, worst);
      S.perfRec.lag = Math.max(S.perfRec.lag, lagWorst);
      S.perfRec.longs += longs;
      S.perfRec.longMax = Math.max(S.perfRec.longMax, longMax);
      // song switches mid-recording are the point: airship-vs-his-song in ONE
      // session is a controlled A/B no bisect can match. Segment by songKey so
      // the seconds do not blend into one pile.
      const key = (typeof S.songKey !== "undefined" && S.songKey) || "(none)";
      if (key !== S.perfRec.song) { S.perfRec.song = key; S.perfRec.marks.push("  ---- song -> " + key + " ----"); }
      const seg = S.perfRec.bySong[key] || (S.perfRec.bySong[key] = {secs: 0, frames: 0, worst: 0, lag: 0});
      seg.secs++; seg.frames += frames;
      seg.worst = Math.max(seg.worst, worst); seg.lag = Math.max(seg.lag, lagWorst);
      S.perfRec.marks.push(String(S.perfRec.sec).padStart(4) + "s  fps " + String(frames).padStart(3) +
                     "  worst " + String(Math.round(worst)).padStart(4) +
                     "  lag " + String(Math.round(lagWorst)).padStart(4) +
                     "  blk " + String(S.perfRec.secBlocks).padStart(2) +
                     "  " + (entries[0] ? entries[0][0] + " " + Math.round(entries[0][1]) : "—"));
      S.perfRec.secBlocks = 0;
      // growth probe: the stalls lengthen over a session, so SOMETHING is
      // being retained. Sample the candidates rather than guess at them.
      const g = num => { try { return num(); } catch (err) { return -1; } };
      S.perfRec.growth.push({
        s: S.perfRec.sec,
        dom: document.getElementsByTagName("*").length,
        nodes: nodes.osc + nodes.buf + nodes.gain + nodes.filt,
        live: nodes.osc + nodes.buf - nodes.ended,
        sched: g(() => S.schedEvents.length),
        roll: g(() => S.rollnotes.length),
        undo: g(() => S.editUndo.length + S.editRedo.length),
      });
    }
    frames = 0; worst = 0; longs = 0; longMax = 0; lagWorst = 0;
    for (const k in acct) acct[k] = 0;
  }, 1000);
})();
// The iOS silent-switch bypass is GONE (Josh, 2026-08-25). It looped a 2.0s
// silent <audio> forever to hold the tab in the "media playback" category the
// hardware mute switch does not silence. On WebKit every loop wrap is a seek,
// and his recordings put a stall burst on exactly that 2.0s beat — clean for
// 70s, then every other second after one note move, worsening until reload.
// It was added 2026-08-22 for a friend's "it won't play"; the perf collapse
// dates from 08-24. A comfort feature is not worth a third of the frame
// budget. If the mute switch bites someone again: say so in the UI, or hold
// the classification with a MUCH longer buffer so seeks are rare — do not
// re-introduce a 2-second loop.
document.addEventListener("pointerdown", function warm() {
  document.removeEventListener("pointerdown", warm);
  ensureAudio();
  resumeAudio();
  if (S.sfPreloadPending) sfPreloadForSong(); // the boot-time preload deferred to this gesture
}, {capture: true});
           document.addEventListener("pointerdown", e => { // tap-away closes the Edit menu
  const es = document.getElementById("editsheet");
  if (es.classList.contains("on") && !es.contains(e.target) && e.target.id !== "editsheetbtn")
    es.classList.remove("on");
}, {capture: true});
document.addEventListener("pointerdown", e => { // tap-away closes the voice menu
  const menu = document.getElementById("voicemenu");
  if (!menu.classList.contains("on")) return;
  if (menu.contains(e.target)) return;
  // only the chip the menu ALREADY belongs to is exempt (its own click handler
  // toggles/rebuilds it) — a tap on any OTHER track's chip is a tap-away, same
  // as tapping the roll (Josh, traced 2026-09-29: a stale menu stayed open,
  // still pointing at the old track, after a first tap on a different chip)
  const chip = e.target.closest && e.target.closest(".chip");
  if (chip && Number(chip.dataset.ti) === S.voiceMenuTi) return;
  menu.classList.remove("on");
}, {capture: true});
                         
                        
        play.gen = 0;
  document.getElementById("albumprev").addEventListener("click", albumPrev);
document.getElementById("albumnext").addEventListener("click", albumNext);
document.getElementById("albumleave").addEventListener("click", albumLeave);


  if (S.viewMode === "tracks") S.RULER_W = TRACKS_GUTTER;                         






 document.getElementById("playbtn").addEventListener("click", () => {
  if (!S.song) return; // first song still fetching
  if (!S.playing && S.playGateShown) { playGateTick.queued = !playGateTick.queued; playGateTick(); return; } // loading: the tap queues (or cancels) the play; it starts when the sound is ready
  S.playing ? stop() : play(S.playCursor > 0 ? tickToSec(S.song, S.playCursor) : 0); // in an album run this is pause/resume — the run stays
});
document.getElementById("rwbtn").addEventListener("click", () => {
  const startX = S.viewMode === "score" ? -SCORE_INTRO_W : 0;
  // a ruler selection — armed or parked — owns ⏮: back to ITS start, and the
  // view goes with it (Josh, 2026-10-04: it used to scroll to bar 1, so it
  // looked like the song start)
  const home = S.rangeSel && S.rangeSel.b > S.rangeSel.a ? S.rangeSel.a : 0;
  const reveal = () => {
    if (!home) { S.view.x = startX; return; }
    const sx = S.viewMode === "score" ? scoreTickToX(home) : S.RULER_W + home * pxPerTick() - S.view.x;
    if (sx >= S.RULER_W && sx <= canvas.clientWidth - 40) return; // already on screen: leave the view alone
    S.view.x = Math.max(startX, S.view.x + sx - S.RULER_W - 40);
    clampView();
  };
  if (S.playing) { stop(); S.playCursor = home; reveal(); play(tickToSec(S.song, home)); return; }
  S.playCursor = home;
  reveal();
  updateSubtitle();
  draw();
});
speedsl.addEventListener("input", () => { speedlbl.textContent = speedsl.value + "%"; });
speedsl.addEventListener("change", () => applySpeed(+speedsl.value)); // on release, not per drag-tick
speedreset.addEventListener("click", () => {
  applySpeed(100);
  document.getElementById("speedpop").style.display = "none"; // reset means done — fold immediately
});
// speed + volume live behind BUTTONS (Josh, 2026-08-22: the slider "takes too
// much space... if I click it, it opens up the slider") — tap toggles the
// popover open; tapping anywhere else folds it back to a button
{
  const pops = [["speedbtn", "speedpop"], ["volbtn", "volpop"]];
  for (const [bid, pid] of pops) {
    document.getElementById(bid).addEventListener("click", () => {
      for (const [b2, p2] of pops) // one open at a time
        document.getElementById(p2).style.display = p2 === pid &&
          document.getElementById(p2).style.display === "none" ? "flex" : "none";
    });
  }
  document.addEventListener("pointerdown", e => {
    for (const [bid, pid] of pops) {
      const pop = document.getElementById(pid);
      if (pop.style.display !== "none" && !pop.contains(e.target) && e.target.id !== bid)
        pop.style.display = "none";
    }
  }, {capture: true});
}
initChrome1();
S.masterVol = +(localStorage.getItem("ff1roll-mastervol") || 1);
volsl.value = String(Math.round(S.masterVol * 100));
vollbl.textContent = Math.round(S.masterVol * 100) + "%";
setVolBtn(Math.round(S.masterVol * 100));
volsl.addEventListener("input", () => {
  S.masterVol = (+volsl.value) / 100;
  vollbl.textContent = volsl.value + "%";
  setVolBtn(+volsl.value);
  localStorage.setItem("ff1roll-mastervol", String(S.masterVol));
  if (S.audio && S.master) S.master.gain.setValueAtTime(MASTER_VOL * S.masterVol, S.audio.currentTime);
});

 function fileMeterAt(tick) { // the file's own declared meter at a tick, or null
  if (!S.song || !S.song.source || !S.song.source.timesigs || !S.song.source.timesigs.length) return null;
  let cur = S.song.source.timesigs[0];
  for (const ts of S.song.source.timesigs) { if (ts.tick <= tick) cur = ts; else break; }
  return {num: cur.num, den: cur.den};
}
{
  // black keys get THREE options (2026-08-12 spec): fused "A#/Bb" = spelling
  // undetermined, plus each asserted spelling — Josh can know a tonic is Bb
  // and not A# before knowing the mode, and the picker must let him say so.
  // Option value = "pc:spelling", fused/naturals = "pc:".
  for (let pc = 0; pc < 12; pc++) {
    const add = (sp, label) => {
      const o = document.createElement("option");
      o.value = pc + ":" + sp;
      o.textContent = label;
      keysel.appendChild(o);
    };
    if (TONIC_SPELL[pc].length === 1) add("", TONIC_SPELL[pc][0]);
    else {
      add("", tonicLabel(pc)); // undecided
      for (const sp of TONIC_SPELL[pc]) add(sp, "· " + sp);
    }
  }
  const nk = document.getElementById("nkeysel"); // editor picker: same tonic list
  for (const opt of keysel.querySelectorAll("option")) {
    if (opt.value === "") continue;
    nk.appendChild(opt.cloneNode(true));
  }
}
 function refreshKeyPreview() { // preview applies only when tonic AND mode are chosen
  const pc = chosenTonicPc(), mode = keymodeSel.value;
  const full = pc !== null && mode ? keyNameFor(pc, mode) : null;
  S.previewSf = full ? full.sf : null;
  keymodeSel.style.display = pc === null ? "none" : "";
  keysetBtn.style.display = pc === null ? "none" : "";
  refreshKeysetLabel();
  buildScoreModel();
  clampView();
  draw();
}
keysel.addEventListener("change", refreshKeyPreview);
keymodeSel.addEventListener("change", refreshKeyPreview);
keysetBtn.addEventListener("click", () => {
  const t = chosenTonic(), mode = keymodeSel.value;
  if (!t || !S.song || !S.songKey) return;
  const bar = Math.floor(S.playCursor / barTicks()) + 1;
  dropLocalKeyAt(bar);
  let name, fresh;
  if (mode) {
    const full = keyNameFor(t.pc, mode);
    name = full.name;
    fresh = {b1: bar, q1: 1, b2: null, q2: null, text: "key: " + name, keydir: full.sf, added: true};
  } else { // tonic only: stored, NOT applied — asserted spelling if Josh chose one
    const tonic = partialNameOf(t);
    name = tonic + "?";
    fresh = {b1: bar, q1: 1, b2: null, q2: null, text: "key: " + name, keypartial: tonic, added: true};
  }
  S.rollnotes.push(resolveNote(fresh));
  S.previewSf = null;
  keysel.value = "";
  keymodeSel.value = "";
  keysetBtn.style.display = "none";
  keymodeSel.style.display = "none";
  finalizeNotes();
  saveLocalNotes();
  buildScoreModel();
  S.lastSubtitle = undefined;
  updateSubtitle();
  draw();
  setInfo(mode ? "key set to " + name + " at bar " + bar + " (unsynced — Sync to commit)"
               : "tonic " + name + " stored at bar " + bar + " — NOT applied until a mode is set");
});
document.getElementById("keysetest").addEventListener("click", () => {
  // promotes the Normal-mode estimate to a real, declared key: annotation —
  // still only on a tap, same as any other key declaration (never written
  // just because Normal mode is on)
  if (!S.song || !S.songKey) return;
  const est = estimateKey();
  if (!est) return;
  const bar = Math.floor(S.playCursor / barTicks()) + 1;
  dropLocalKeyAt(bar);
  const fresh = {b1: bar, q1: 1, b2: null, q2: null, text: "key: " + est.name, keydir: est.sf, added: true};
  S.rollnotes.push(resolveNote(fresh));
  finalizeNotes();
  saveLocalNotes();
  buildScoreModel();
  S.lastSubtitle = undefined;
  updateSubtitle();
  draw();
  setInfo("key set to " + est.name + " at bar " + bar + " (from the estimate — unsynced — Sync to commit)");
});

met.on = false;
{
  const num = document.getElementById("metnum");
  for (let n = 1; n <= 12; n++) {
    const o = document.createElement("option");
    o.textContent = String(n);
    num.appendChild(o);
  }
  num.value = String(met.num);
  document.getElementById("metden").value = String(met.den);
  document.getElementById("metsub").value = String(met.sub);
  document.getElementById("metbpm").value = String(met.bpm);
  document.getElementById("metbpmlbl").textContent = met.bpm + " bpm";
  document.getElementById("metfollow").value = met.follow;
  document.getElementById("metcountin").checked = !!met.countIn;
  metBuildCells();
  applyMetMode();
}
// ⏱ is a one-tap click toggle, the DAW habit (Logic's K); ⚙ beside it opens
// the settings (Josh, 2026-09-29: three taps to turn the click on was too many)
document.getElementById("metbtn").addEventListener("click", () => met.on ? metHalt() : metStart());
document.getElementById("metcfg").addEventListener("click", () => {
  const sheet = document.getElementById("metsheet");
  if (sheet.classList.contains("on")) { sheet.classList.remove("on"); return; }
  const r = document.getElementById("metbtn").getBoundingClientRect();
  sheet.style.top = (r.bottom + 6) + "px";
  sheet.classList.add("on");
  // right-anchor near the button, clamped on-screen
  requestAnimationFrame(() => {
    const w = sheet.offsetWidth;
    sheet.style.left = Math.max(6, Math.min(r.right - w, songRegionRight() - w - 6)) + "px";
  });
});
document.getElementById("metclose").addEventListener("click", () =>
  document.getElementById("metsheet").classList.remove("on")); // panel closes; the click keeps going
document.getElementById("metgo").addEventListener("click", () => met.on ? metHalt() : metStart());
document.getElementById("metbpm").addEventListener("input", e => {
  met.bpm = +e.target.value;
  document.getElementById("metbpmlbl").textContent = met.bpm + " bpm";
  metSave();
});
document.getElementById("metnum").addEventListener("change", e => {
  met.num = +e.target.value;
  met.accents = metDefaultAccents();
  metSave();
  metBuildCells();
});
document.getElementById("metden").addEventListener("change", e => {
  met.den = +e.target.value;
  met.accents = metDefaultAccents();
  metSave();
  metBuildCells();
});
document.getElementById("metsub").addEventListener("change", e => {
  met.sub = +e.target.value;
  metSave();
});
document.getElementById("metfollow").addEventListener("change", e => {
  met.follow = e.target.value;
  applyMetMode();
});
document.getElementById("metnudgeL").addEventListener("click", () => {
  met.nudge = (((met.nudge - 1) % metFollowNum()) + metFollowNum()) % metFollowNum();
  metSave();
});
document.getElementById("metnudgeR").addEventListener("click", () => {
  met.nudge = (met.nudge + 1) % metFollowNum();
  metSave();
});
document.getElementById("metcountin").addEventListener("change", e => {
  met.countIn = e.target.checked;
  metSave();
});
document.getElementById("mettap").addEventListener("click", () => {
  const now = performance.now();
  S.metTaps = S.metTaps.filter(t => now - t < 3000);
  S.metTaps.push(now);
  if (S.metTaps.length >= 2) {
    const gaps = S.metTaps.slice(1).map((t, i) => t - S.metTaps[i]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    met.bpm = Math.max(30, Math.min(260, Math.round(60000 / avg)));
    document.getElementById("metbpm").value = String(met.bpm);
    document.getElementById("metbpmlbl").textContent = met.bpm + " bpm";
    metSave();
  }
});

                  function dedupeSong() { // 🧹 back by demand (Josh 2026-08-18: old drafts keep
  // re-saving pre-guard stacks over the cleaned repo file — HE runs it, HE
  // saves). Whole song, every track; exact same start+pitch WITHIN one track
  // collapses to the longest; cross-track unisons untouched by construction.
  if (!editableSong()) return 0;
  const erased = [];
  S.song.tracks.forEach((tr, ti) => {
    const best = new Map();
    tr.notes.forEach((n, ni) => {
      if (n.gone) return;
      const k = n.t + ":" + n.p;
      const prev = best.get(k);
      if (!prev) { best.set(k, {ni, d: n.d}); return; }
      const loser = n.d > prev.d ? prev.ni : ni;
      if (n.d > prev.d) best.set(k, {ni, d: n.d});
      const ln = tr.notes[loser];
      ln.gone = true;
      const rn = S.song.rawNotes && ln.ri !== undefined && S.song.rawNotes[ti][ln.ri];
      if (rn) rn.gone = true;
      erased.push({ti, ni: loser});
    });
  });
  if (!erased.length) return 0;
  pushUndo({kind: "eraseBatch", items: erased});
  S.multiSel = []; S.multiSelKey = new Set(); S.selNote = null;
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return erased.length;
}
function insertChordAt(tick, rootPc, qual, oct, durQ) {
  if (!editableSong()) return 0;
  // P4 (docs/annotations-v2.md): closes P3's gap — this tool writes a chord
  // BAND (an annotation, stampChordBand below) along with the notes; a
  // locked song refuses the whole gesture rather than leave the band out
  if (S.rollnotesReadOnly) { setInfo(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); return 0; }
  const annoBefore = annoSnapshot(); // the ruler band undoes with the notes (Josh, 2026-09-12)
  const ivs = (CHORD_QUALS.find(([q]) => q === qual) || CHORD_QUALS[0])[1];
  const snap = Math.max(1, Math.round(S.song.ppq * (durQ || S.pencilDur)));
  const t0 = Math.max(0, Math.round(tick / snap) * snap);
  const base = (oct + 1) * 12 + rootPc;
  const tr = S.song.tracks[S.selTrack], isAdd = !isComposition();
  const added = [];
  for (const iv of ivs) {
    const p = base + iv;
    if (p < S.PMIN || p > S.PMAX) continue;
    if (tr.notes.some(n => !n.gone && n.t === t0 && n.p === p)) continue; // never stack
    tr.notes.push({t: t0, d: snap, p, v: S.pencilVel, added: isAdd});
    if (S.song.rawNotes) S.song.rawNotes[S.selTrack].push({t: t0 + S.chopS, d: snap, p, v: S.pencilVel, added: isAdd});
    added.push({ti: S.selTrack, ni: tr.notes.length - 1});
  }
  if (!added.length) return 0;
  pushUndo({kind: "group", entries: [{kind: "anno", json: annoBefore}, {kind: "addBatch", items: added}]});
  S.multiSel = added.slice();
  S.multiSelKey = new Set(added.map(({ti, ni}) => ti + ":" + ni));
  S.selNote = null;
  stampChordBand(t0, snap, chordSym(rootPc, qual));
  finalizeNotes();
  saveLocalNotes();
  S.playCursor = t0 + snap; // walk forward: the next insert lands right after
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return added.length;
}
{
  const roots = document.getElementById("chroots"), quals = document.getElementById("chquals");
  const preview = () => { document.getElementById("chpreview").textContent = chordLabel(); };
  roots.innerHTML = CHORD_ROOTS.map((r, i) =>
    '<button data-root="' + i + '" style="min-height:40px">' + r + '</button>').join("");
  quals.innerHTML = CHORD_QUALS.map(([q]) =>
    '<button data-qual="' + q + '" style="min-height:40px">' + (q === "maj" ? "maj" : q) + '</button>').join("");
  const sel = document.getElementById("choct");
  sel.innerHTML = [2, 3, 4, 5, 6].map(o => '<option' + (o === 4 ? ' selected' : '') + '>' + o + '</option>').join("");
  sel.addEventListener("change", () => { S.chordOct = parseInt(sel.value, 10); });
  const durOpts = v => INS_DURS.map(([lb, q]) =>
    '<option value="' + q + '"' + (q === v ? ' selected' : '') + '>' + lb + '</option>').join("");
  const chdur = document.getElementById("chdur");
  chdur.innerHTML = durOpts(S.chordInsDur);
  chdur.addEventListener("change", () => {
    S.chordInsDur = parseFloat(chdur.value);
    const pg = document.getElementById("pgdur");
    if (pg) pg.value = chdur.value;
  });
  const mark = () => {
    for (const b of roots.children) b.classList.toggle("primary", +b.dataset.root === S.chordRoot);
    for (const b of quals.children) b.classList.toggle("primary", b.dataset.qual === S.chordQual);
    preview();
  };
  roots.addEventListener("click", e => {
    const b = e.target.closest("button[data-root]");
    if (b) { S.chordRoot = +b.dataset.root; mark(); }
  });
  quals.addEventListener("click", e => {
    const b = e.target.closest("button[data-qual]");
    if (b) { S.chordQual = b.dataset.qual; mark(); }
  });
  document.getElementById("insbtn").addEventListener("click", () => {
    if (!editableSong()) { setInfo("chords insert on your own songs — captures are locked"); return; }
    mark();
    document.getElementById("chordsheet").classList.add("on");
  });
  document.getElementById("chinsert").addEventListener("click", () => {
    const k = insertChordAt(S.playCursor, S.chordRoot, S.chordQual, S.chordOct, S.chordInsDur);
    setInfo(k ? "inserted " + chordLabel() + " (" + k + " notes) — cursor moved to the next slot"
              : "couldn't insert — check the octave fits the C1..C7 range");
  });
}
 function insertProgressionAt(tick, progStr, tonicPc, oct, durQ, minorScale) {
  if (!editableSong()) return 0;
  const chords = splitProgression(progStr).map(t => parseNumeral(t, minorScale));
  if (!chords.length || chords.some(c => !c)) return 0;
  const annoBefore = annoSnapshot(); // the bands undo with the notes (Josh, 2026-09-12: undo left them behind)
  const snap = Math.max(1, Math.round(S.song.ppq * (durQ || S.pencilDur)));
  let t0 = Math.max(0, Math.round(tick / snap) * snap);
  const tr = S.song.tracks[S.selTrack], isAdd = !isComposition();
  const added = [];
  for (const c of chords) {
    const ivs = CHORD_QUALS.find(([q]) => q === c.qual)[1];
    const base = (oct + 1) * 12 + ((tonicPc + c.pcOff) % 12);
    for (const iv of ivs) {
      const p = base + iv;
      if (p < S.PMIN || p > S.PMAX) continue;
      if (tr.notes.some(n => !n.gone && n.t === t0 && n.p === p)) continue; // never stack
      tr.notes.push({t: t0, d: snap, p, v: S.pencilVel, added: isAdd});
      if (S.song.rawNotes) S.song.rawNotes[S.selTrack].push({t: t0 + S.chopS, d: snap, p, v: S.pencilVel, added: isAdd});
      added.push({ti: S.selTrack, ni: tr.notes.length - 1});
    }
    stampChordBand(t0, snap, chordSym((tonicPc + c.pcOff) % 12, c.qual));
    t0 += snap;
  }
  if (!added.length) return 0;
  pushUndo({kind: "group", entries: [{kind: "anno", json: annoBefore}, {kind: "addBatch", items: added}]}); // notes + bands = one undo
  finalizeNotes();
  saveLocalNotes();
  S.multiSel = added.slice();
  S.multiSelKey = new Set(added.map(({ti, ni}) => ti + ":" + ni));
  S.selNote = null;
  S.playCursor = t0;
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return added.length;
}
{
  const panel = document.getElementById("progpanel");
  panel.innerHTML =
    '<div class="row" style="flex-wrap:wrap;gap:6px;padding:4px 2px 8px">' +
      '<span class="lbl">tonic</span><select id="pgtonic">' +
        CHORD_ROOTS.map((r, i) => '<option value="' + i + '">' + r + '</option>').join("") +
      '</select><span class="lbl">octave</span><select id="pgoct">' +
        [2, 3, 4, 5, 6].map(o => '<option' + (o === 4 ? ' selected' : '') + '>' + o + '</option>').join("") +
      '</select><span class="lbl">duration</span><select id="pgdur">' +
        INS_DURS.map(([lb, q]) => '<option value="' + q + '"' + (q === 1 ? ' selected' : '') + '>' + lb + '</option>').join("") +
      '</select><span class="lbl" style="opacity:.7">tap a progression to insert it at the cursor — one chord per slot</span></div>' +
    '<div class="row" style="flex-wrap:wrap;gap:6px;padding:0 2px 8px">' +
      '<span class="lbl">type your own</span>' +
      '<input type="text" id="pgcustom" placeholder="i – VI – VII – V" style="flex:1;min-width:160px;min-height:40px">' +
      '<select id="pgmode"><option value="major">major scale</option><option value="minor">minor scale</option></select>' +
      '<button id="pggo">Insert</button></div>' +
    PROG_LIB.map(([mood, prog, why], i) =>
      '<div class="prow" data-prog="' + i + '"><b>' + mood + '</b><span class="pchords">' + prog + '</span><small>' + why + '</small></div>'
    ).join("");
  panel.addEventListener("click", e => {
    const row = e.target.closest(".prow[data-prog]");
    if (!row) return;
    if (!editableSong()) { setInfo("progressions insert on your own songs — captures are locked"); return; }
    const [mood, prog] = PROG_LIB[+row.dataset.prog];
    const tonicPc = +document.getElementById("pgtonic").value;
    const oct = parseInt(document.getElementById("pgoct").value, 10);
    S.chordInsDur = parseFloat(document.getElementById("pgdur").value);
    document.getElementById("chdur").value = document.getElementById("pgdur").value;
    const k = insertProgressionAt(S.playCursor, prog, tonicPc, oct, S.chordInsDur);
    setInfo(k ? "inserted " + mood + " in " + CHORD_ROOTS[tonicPc].split("/")[0] + " (" + k + " notes) — stretch or move them from here"
              : "couldn't insert — check the octave fits C1..C7");
  });
  // typed progression: the same insert, numerals read against the chosen
  // scale (minor pre-selects itself from a minor key at the cursor)
  const insertCustom = () => {
    const prog = document.getElementById("pgcustom").value.trim();
    if (!prog) { setInfo("type a progression first — numerals like i – VI – VII – V"); return; }
    if (!editableSong()) { setInfo("progressions insert on your own songs — captures are locked"); return; }
    const minorScale = document.getElementById("pgmode").value === "minor";
    const bad = splitProgression(prog).filter(t => !parseNumeral(t, minorScale));
    if (bad.length) { setInfo("couldn't read " + bad.join(", ") + " — use I..VII, lowercase for minor, ♭/♯ or b/# in front, °/7/maj7/6 after"); return; }
    const tonicPc = +document.getElementById("pgtonic").value;
    const oct = parseInt(document.getElementById("pgoct").value, 10);
    S.chordInsDur = parseFloat(document.getElementById("pgdur").value);
    document.getElementById("chdur").value = document.getElementById("pgdur").value;
    const k = insertProgressionAt(S.playCursor, prog, tonicPc, oct, S.chordInsDur, minorScale);
    setInfo(k ? "inserted " + prog + " in " + CHORD_ROOTS[tonicPc].split("/")[0] + (minorScale ? " minor" : "") + " (" + k + " notes) — erase tones to make arpeggios"
              : "couldn't insert — check the octave fits C1..C7");
  };
  document.getElementById("pggo").addEventListener("click", insertCustom);
  document.getElementById("pgcustom").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); insertCustom(); } });
  // one panel, two homes (Josh: "let's do both") — it reparents into whichever
  // dialog summons it
  const tabC = document.getElementById("chtab-chord"), tabP = document.getElementById("chtab-prog");
  const seedTonic = () => { // declared key at the cursor pre-fills the tonic (override freely)
    const name = S.song ? keyNameAt(S.playCursor) : null;
    const pc = name ? tonicPcOfName(name) : null;
    if (pc !== null) document.getElementById("pgtonic").value = pc;
    if (name) document.getElementById("pgmode").value = /m$|minor|aeolian|dorian|phrygian/i.test(name) ? "minor" : "major";
  };
  const setTab = prog => {
    if (prog) { document.getElementById("chprogslot").appendChild(panel); seedTonic(); }
    document.getElementById("chchordpane").style.display = prog ? "none" : "";
    panel.style.display = prog ? "block" : "none";
    tabC.classList.toggle("primary", !prog);
    tabP.classList.toggle("primary", prog);
    tabC.setAttribute("aria-selected", String(!prog));
    tabP.setAttribute("aria-selected", String(prog));
  };
  tabC.addEventListener("click", () => setTab(false));
  tabP.addEventListener("click", () => setTab(true));
  // reopening the dialog re-reads the key too: Josh set a key with the
  // dialog already on the Progression tab and it kept the stale scale
  document.getElementById("insbtn").addEventListener("click", () => { if (editableSong()) seedTonic(); });
  const cofBtn = document.getElementById("cofprogbtn");
  cofBtn.addEventListener("click", () => {
    const showing = panel.parentElement.id === "cofprogslot" && panel.style.display !== "none";
    if (!showing) { document.getElementById("cofprogslot").appendChild(panel); panel.style.display = "block"; seedTonic(); }
    else panel.style.display = "none";
    for (const id of ["cofcanvas", "cofdetail", "cofccw", "cofcw"])
      document.getElementById(id).style.display = showing ? "" : "none";
    cofBtn.textContent = showing ? "Progressions" : "Wheel";
  });
}
 document.getElementById("cofbtn").addEventListener("click", () => {
  const g = S.song ? sfShownAt(curTick()) : null;
  S.cofSf = g !== null ? wrapSf(g) : 0;
  S.cofRot = S.cofSf; // the song's key rides at 12 o'clock
  document.getElementById("cofsheet").classList.add("on");
  drawCof();
});
// Undo/Redo spin the WHEEL a fifth at a time; the degree window moves by tapping wedges
document.getElementById("cofcw").addEventListener("click", () => { S.cofRot = wrapSf(S.cofRot - 1); drawCof(); });
document.getElementById("cofccw").addEventListener("click", () => { S.cofRot = wrapSf(S.cofRot + 1); drawCof(); });
cofCanvas.addEventListener("pointerdown", e => {
  cofCanvas.setPointerCapture(e.pointerId);
  S.cofPtr = {id: e.pointerId, a0: cofAngle(e), rot0: S.cofRot, moved: false};
});
cofCanvas.addEventListener("pointermove", e => {
  if (!S.cofPtr || S.cofPtr.id !== e.pointerId) return;
  let d = cofAngle(e) - S.cofPtr.a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  if (Math.abs(d) > 0.06) S.cofPtr.moved = true;
  if (S.cofPtr.moved) {
    S.cofDragRot = S.cofPtr.rot0 - d / (Math.PI / 6); // wheel follows the finger
    drawCof();
  }
});
cofCanvas.addEventListener("pointerup", cofRelease);
cofCanvas.addEventListener("pointercancel", () => { S.cofPtr = null; S.cofDragRot = null; drawCof(); });

document.getElementById("listbtn").addEventListener("click", e => {
  document.getElementById("notesstrip").textContent = S.subOn ? "Hide notes strip" : "Show notes strip";
  openDropUp(e.currentTarget, document.getElementById("notesmenu"));
});
document.getElementById("notesstrip").addEventListener("click", () => { closeDropUp(); toggleSubtitle(); renderViewMenu(); });
document.getElementById("notesall").addEventListener("click", () => { closeDropUp(); openNoteList(); });
document.getElementById("notelistSync").addEventListener("click", () => {
  notelistSheet.classList.remove("on");
  document.getElementById("syncbtn").click();
  S.syncReturnToList = true; // after a successful commit, go back to the list
});
document.getElementById("notelistAdd").addEventListener("click", () => {
  notelistSheet.classList.remove("on");
  openEditor(null);
});

document.getElementById("helptabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-hs]");
  if (b) showHelpTab(b.dataset.hs);
});
document.getElementById("filehelp").addEventListener("click", () => {
  closeFileMenus();
  showHelpTab(localStorage.getItem("ff1roll-helptab") || "views");
  document.getElementById("helpsheet").classList.add("on");
});
document.getElementById("fileabout").addEventListener("click", () => {
  closeFileMenus();
  const n = Object.values(S.CATALOG).reduce((k, s) => k + s.length, 0);
  document.getElementById("aboutstats").textContent =
    Object.keys(S.CATALOG).length + " albums · " + n + " songs · " + draftKeys().length + " local drafts";
  document.getElementById("aboutsheet").classList.add("on");
});

findsel.addEventListener("focus", refreshFindSel);
findsel.addEventListener("change", () => {
  S.findPc = findsel.value === "" ? null : +findsel.value;
  if (S.findPc === null) { setInfo("find: off"); draw(); return; }
  let count = 0;
  const chans = new Set();
  if (S.song) S.song.tracks.forEach((tr, ti) => {
    if (!trackShown(ti) || trackIsDrums(ti)) return;
    for (const n of tr.notes) if (!n.gone && n.p % 12 === S.findPc) { count++; chans.add(tr.name || "track " + (ti + 1)); }
  });
  const sf = sfShownAt(curTick());
  const deg = degreeOf(S.findPc, keyNameShownAt(curTick()));
  const name = spellPc(S.findPc, sf) + (deg ? " (degree " + deg + ")" : "");
  setInfo(count ? "find " + name + ": " + count + " notes — " + [...chans].join(", ")
                : "find " + name + ": 0 — not present in this song");
  draw();
});

lassobtn.addEventListener("click", () => {
  S.lassoMode = !S.lassoMode;
  lassobtn.classList.toggle("active", S.lassoMode);
  lassobtn.setAttribute("aria-pressed", String(S.lassoMode));
  clearMultiSel();
  setInfo(S.lassoMode ? "lasso: drag across notes to identify them" : "tap a note");
  draw();
});
document.getElementById("chcopy").addEventListener("click", async e => {
  try { await navigator.clipboard.writeText(S.challengeCopy); e.target.textContent = "✓ copied"; }
  catch { e.target.textContent = "✗ copy failed"; }
  setTimeout(() => { e.target.textContent = "Copy"; }, 1200);
});
document.getElementById("chordbtn").addEventListener("click", () => {
  if (S.challengeSec) { openChallenge(S.challengeSec); return; }
  if (!S.multiSel.length) return;
  const pitches = S.multiSel.map(s => S.song.tracks[s.ti].notes[s.ni].p);
  const names = [...new Set(pitches)].sort((a, b) => a - b).map(p => pitchName(p, S.multiSelSf));
  const chordName = nameChord(pitches, S.multiSelSf);
  setInfo(names.join(" · ") + "  →  " + chordName, names.join(", ") + " — " + chordName);
});

if (typeof document !== "undefined" && document.body) { // real browser only — layout/Mutation observers are not unit tested, like the wmdock menu's own dismissal above
  const footerEl = document.getElementById("footer");
  if (typeof ResizeObserver === "function") new ResizeObserver(scheduleFitReadline).observe(footerEl);
  // buttons appearing/disappearing (⚠/✦ reply/Clear edits, ⊞ Lasso's own
  // label dropping to a glyph past ~420px) change the leftover without
  // necessarily resizing the footer itself
  if (typeof MutationObserver === "function") new MutationObserver(scheduleFitReadline).observe(footerEl, {attributes: true, attributeFilter: ["style", "class"], subtree: true});
}
fitReadline(); // initial state — applyChrome() isn't called at boot when nothing is folded
{
  const old = localStorage.getItem("ff1roll-panelhide"); // migrate the combined key
  if (old !== null) {
    localStorage.setItem("ff1roll-editrow-hidden", old);
    localStorage.setItem("ff1roll-footer-hidden", old);
    localStorage.removeItem("ff1roll-panelhide");
  }
  // phones start folded (a hand-sized screen is for the music, not the
  // buttons); an explicit choice becomes the remembered one. iPads and up
  // start open. min(screen dims) < 500 CSS px ≈ every phone, no iPad.
  const scr = (typeof screen !== "undefined" && screen) || {width: 1024, height: 768};
  const phone = Math.min(scr.width, scr.height) < 500;
  const er = localStorage.getItem("ff1roll-editrow-hidden");
  const fo = localStorage.getItem("ff1roll-footer-hidden");
  S.editrowHidden = er === null ? phone : er === "1";
  S.footerHidden = fo === null ? phone : fo === "1";
  // phones are PLAYERS by default (Josh, 2026-08-23: "I want to send songs to
  // people and have them open them and listen") — roll + transport, nothing
  // else; the Full app button opts a device back into the whole DAW
  const lm = localStorage.getItem("ff1roll-listener");
  S.listenerMode = lm === null ? phone : lm === "1";
  applyListener();
  document.getElementById("fullappbtn").addEventListener("click", () => {
    S.listenerMode = false;
    localStorage.setItem("ff1roll-listener", "0");
    applyListener();
    setInfo("full app on — View ▾ → 'Listener mode' folds it back");
  });
  // the ▾ hide buttons retired (Josh, 2026-08-22): hiding is the View menu's
  // job now; the floating ▴ stays as the never-strand restore
  document.getElementById("panelshow").addEventListener("click", () => { S.editrowHidden = S.footerHidden = false; applyChrome(); });
  if (S.editrowHidden || S.footerHidden) applyChrome();
}


  viewbtn.addEventListener("click", e => openDropUp(e.currentTarget, viewSwitchMenu));
document.getElementById("vsRoll").addEventListener("click", () => { closeDropUp(); setViewMode("roll"); });
document.getElementById("vsTracks").addEventListener("click", () => { closeDropUp(); setViewMode("tracks"); });
document.getElementById("vsScore").addEventListener("click", () => { closeDropUp(); setViewMode("score"); });

// (editOn is declared early, with the view state — the phone boot path calls
// renderViewMenu before this file's later sections ran; TDZ here bricked
// every iPhone: "Cannot access 'editOn' before initialization", 2026-08-23)
document.getElementById("accseg").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  S.pencilAcc = b.dataset.acc;
  for (const x of document.querySelectorAll("#accseg button")) {
    x.classList.toggle("active", x === b);
    x.setAttribute("aria-checked", String(x === b));
  }
});
 // [{name, parsed}] awaiting a destination choice
document.getElementById("cfgnsfcreate").addEventListener("click", async e => {
  const btn = e.currentTarget, out = document.getElementById("cfgnsfstatus");
  btn.disabled = true;
  try { const full = await createGameFilesRepo(t => { out.textContent = t; }); if (full) document.getElementById("cfgnsfrepo").value = full; }
  catch (err) { out.textContent = "⚠ " + err.message; }
  finally { btn.disabled = false; }
});
document.getElementById("fileinput").addEventListener("change", async e => {
  const files = [...e.target.files];
  if (!files.length) return;
  stop();
  closeFileMenus();
  try {
    const loaded = [];
    for (const f of files) loaded.push({name: f.name, bytes: new Uint8Array(await f.arrayBuffer())});
    await openPickedFiles(loaded);
  } catch (err) { setInfo("could not import: " + err.message); }
  e.target.value = ""; // allow re-picking the same file
});
document.getElementById("fileimporthub").addEventListener("click", () => {
  closeFileMenus();
  document.getElementById("importhubstatus").textContent = "Drop files anywhere on this panel, or use a section's Choose files… above.";
  document.getElementById("importhub").classList.add("on");
});
// by id, not document.querySelectorAll("[data-kind]") — the vm harness's
// document stub has no querySelectorAll, only getElementById (NIGHT-ROLL.md/
// CLAUDE.md: the harness strings-match the hub's markup instead)
for (const [id, kind] of [["ihMidi", "midi"], ["ihNes", "nes"], ["ihGb", "gb"], ["ihSnes", "snes"],
                          ["ihGenesis", "genesis"], ["ihPs1", "ps1"], ["ihPs2", "ps2"], ["ihN64", "n64"],
                          ["ihSf2", "sf2"], ["ihAudio", "audio"]]) {
  document.getElementById(id).addEventListener("click", () => {
    document.getElementById("importhubstatus").textContent = "choose your " + importHubLabel(kind) + " file(s)…";
    document.getElementById("fileinput").click();
  });
}
// the drop target (phase 2 of the design): dragover/drop on #importhub only,
// feeding the dropped files to the same openPickedFiles the picker uses —
// its own comment above already anticipated a drop.
document.getElementById("importhub").addEventListener("dragover", e => {
  e.preventDefault();
  document.getElementById("importhub").classList.add("dragover");
});
document.getElementById("importhub").addEventListener("dragleave", e => {
  if (e.target === document.getElementById("importhub")) document.getElementById("importhub").classList.remove("dragover");
});
document.getElementById("importhub").addEventListener("drop", async e => {
  e.preventDefault();
  document.getElementById("importhub").classList.remove("dragover");
  const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
  if (!files.length) return;
  stop();
  try {
    const loaded = [];
    for (const f of files) loaded.push({name: f.name, bytes: new Uint8Array(await f.arrayBuffer())});
    await openPickedFiles(loaded);
  } catch (err) { setInfo("could not import: " + err.message); }
  closeFileMenus();
});
document.getElementById("midcancel").addEventListener("click", () => {
  S.pendingMidis = null;
  document.getElementById("midisheet").classList.remove("on");
});
 document.getElementById("audioinput").addEventListener("change", async e => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length) return;
  stop();
  try {
    const items = [];
    for (const f of files) items.push({name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), type: f.type});
    await importAudioFiles(items);
  } catch (err) { setInfo("could not import: " + err.message); }
});
document.getElementById("midlocal").addEventListener("click", () => {
  if (!S.pendingMidis || !S.pendingMidis.length) return;
  const {name, parsed} = S.pendingMidis[0];
  S.pendingMidis = null;
  document.getElementById("midisheet").classList.remove("on");
  localMidiOpen(parsed, name);
});
document.getElementById("midcreate").addEventListener("click", () => {
  if (!S.pendingMidis || !S.pendingMidis.length) return;
  const alb = document.getElementById("midalbum").value.trim();
  if (!alb) { setInfo("⚠ name the album first"); return; }
  const slug = folderFromInput(alb) || slugify(alb);
  let firstKey = null;
  for (const {name, parsed} of S.pendingMidis) {
    const base = slugify(name.replace(/\.(midi?|smf|kar|rmi)$/i, ""));
    const key = "albums/" + slug + "/" + base + ".mid"; // MIDI files: a folder of the user's own, editable, published like any song
    if (!firstKey) firstKey = key;
    draftWrite(key, {
      savedStamp: 0, dirty: true, title: name.replace(/\.(midi?|smf|kar|rmi)$/i, ""),
      ppq: parsed.ppq, timesig: parsed.timesig || [4, 4],
      ...(parsed.source ? {source: parsed.source} : {}), // the file's OWN meter/key history, kept apart from what he later declares (docs/declared-vs-learner-spec.md)
      tempos: parsed.tempos,
      tracks: parsed.tracks.map(tr => ({name: tr.name,
        ...(tr.midiPan !== undefined ? {midiPan: tr.midiPan} : {}),
        ...(tr.offset ? {offset: tr.offset} : {}),
        ...(tr.srcIndex !== undefined ? {srcIndex: tr.srcIndex} : {}), // docs/declared-vs-learner-spec.md phase 2: how the raw metas in source.metas reattach after edits
        notes: tr.notes.map(nt => {
        const o = {t: nt.t, d: nt.d, p: nt.p, v: nt.v};
        if (nt.ch !== undefined) o.ch = nt.ch;
        if (nt.duty !== undefined) o.duty = nt.duty;
        if (nt.ve !== undefined) o.ve = nt.ve;
        return o;
      })}))});
  }
  const count = S.pendingMidis.length;
  S.pendingMidis = null;
  document.getElementById("midisheet").classList.remove("on");
  stop();
  openDraft(firstKey);
  setInfo(count + " song" + (count === 1 ? "" : "s") + " in album \"" + alb +
          "\" — Open → LOCAL to audition/rename, ⇪ Publish sends it to the songs repo.");
});
document.getElementById("modeseg").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  // tapping the active tool AGAIN turns it off (Josh: sometimes you just want
  // to drag the song around without accidentally moving a note)
  S.mode = b.dataset.mode === S.mode ? null : b.dataset.mode;
  for (const x of document.querySelectorAll("#modeseg button")) {
    x.classList.toggle("active", x.dataset.mode === S.mode);
    x.setAttribute("aria-checked", String(x.dataset.mode === S.mode));
  }
  // duration chips show in Select too: there they are the MOVE grid (T = triplet
  // steps), so changing it doesn't cost a trip through Pencil (Josh, 2026-09-12)
  document.getElementById("durseg").style.display = S.mode === "pencil" || S.mode === "select" ? "" : "none";
  // velocities show in Select too: with a selection they APPLY to it
  document.getElementById("velseg").style.display = S.mode === "pencil" || S.mode === "select" ? "" : "none";
  document.getElementById("accseg").style.display =
    S.mode === "pencil" && S.viewMode === "score" ? "" : "none";
  setInfo(S.mode === "pencil" ? (S.viewMode === "score" ? "pencil: tap a staff position — the stave picks the track"
                                                    : "pencil: tap grid to add to selected track") :
          S.mode === "erase" ? "erase: tap a note to remove" :
          S.mode === "select" ? "tap a note" : "pan: drag moves the view — notes are safe");
});
document.getElementById("durseg").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.grid) { openGridSheet(); return; } // the ▦N chip: the grid sheet, from either mode
  if (b.dataset.nv) S.pencilNV = parseInt(b.dataset.nv, 10);
  else if (b.dataset.mod) S.pencilMod = parseFloat(b.dataset.mod);
  else return;
  S.pencilDur = (4 / S.pencilNV) * S.pencilMod;
  syncDurSeg();
});
document.getElementById("clearbtn").addEventListener("click", () => {
  if (editsKey()) localStorage.removeItem(editsKey());
  loadSong(S.songKey).catch(e => setInfo(e.message));
});
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(wrap);
  document.addEventListener("pointerdown", function midiWarm() {
  document.removeEventListener("pointerdown", midiWarm);
  // the iPad app's native MIDI bridge starts only when ● asks for it — never
  // on the first touch, where an untested native path failing would cost
  // the whole app (2026-09-30, the plugin is new and unheard on a device)
  const C = typeof window !== "undefined" && window.Capacitor;
  if (C && C.isNativePlatform && C.isNativePlatform()) return;
  initWebMidi(); // permission prompt wants a user gesture
}, {capture: true});
document.getElementById("recbtn").addEventListener("click", async () => {
  albumClear();
  if (S.recording || S.playing) { stop(); return; } // ● while rolling = stop (commits the take)
  if (!S.song || !editableSong()) { setInfo("recording works on your own songs"); return; }
  if (!S.instOpen) { S.instOpen = true; localStorage.setItem("ff1roll-inst-open", "1"); applyInst(); }
  S.recording = true;
  S.recTake = [];
  document.getElementById("recbtn").classList.add("rec");
  initWebMidi();
  setInfo("recording onto " + (S.song.tracks[S.selTrack].name || "track") + " — 🎹 keys or MIDI; ● or ■ stops · " + midiStatusLine());
  await play(S.playCursor > 0 ? tickToSec(S.song, S.playCursor) : 0);
  if (!S.recording && S.playing) stop(); // ● was released while play() was still waking the audio context
});
instCanvas.addEventListener("pointerdown", instPointerDown);
instCanvas.addEventListener("pointermove", instPointerMove);
instCanvas.addEventListener("pointerup", e => instPointerUp(e, false));
instCanvas.addEventListener("pointercancel", e => instPointerUp(e, true));
new ResizeObserver(instResize).observe(instWrap);
document.getElementById("instplay").addEventListener("click", () => instSetMode("play"));
document.getElementById("instscroll").addEventListener("click", () => instSetMode("scroll"));
document.getElementById("instoctdn").addEventListener("click", () => instOctave(-1));
document.getElementById("instoctup").addEventListener("click", () => instOctave(1));
document.getElementById("instlock").addEventListener("click", () => instSetLock(!S.instLock));
document.getElementById("instsustain").addEventListener("click", () => instSetSustain(!S.instSustain));
instbtn.addEventListener("click", () => {
  S.instOpen = !S.instOpen;
  localStorage.setItem("ff1roll-inst-open", S.instOpen ? "1" : "0");
  if (!S.instOpen) instReleaseAll(); // nothing rings on from a closed panel
  applyInst();
  draw(); // closing the panel while Fall is active must restore the roll
});
// ⎘ Web session (Sync sheet): copies the clone-first bootstrap instruction —
// Josh pastes it into a fresh Claude Web chat to start a from-bed tutoring
// session with full project context.
document.getElementById("websess").addEventListener("click", async e => {
  // Copy an INSTRUCTION, not a bare URL (Josh, 2026-08-25: "I have to tell
  // Claude on the web every single time to clone the repo instead of
  // following URLs"). Pasting a URL makes the session's first act a fetch,
  // and it keeps fetching from there. Lead with the clone.
  const repo = "https://github.com/" + repoName("analysis") + ".git";
  const msg = "Clone this repo, then read night-roll/WEB-SESSION.md from disk and follow it. " +
    "Work entirely from the clone — do not fetch any file by URL.\n\n" +
    "cd /home/claude && git clone --depth 1 --filter=blob:limit=1m " + repo + "\n";
  try { await navigator.clipboard.writeText(msg); e.target.textContent = "✓ copied — paste to Claude"; }
  catch { e.target.textContent = "✗ copy failed"; }
  setTimeout(() => { e.target.textContent = "⎘ Web session"; }, 1800);
});
subbtn.classList.toggle("active", S.subOn);
subbtn.setAttribute("aria-pressed", String(S.subOn));
instFallBtn.addEventListener("click", () => {
  S.fallOn = !S.fallOn;
  if (S.fallOn) { // fall is piano-only and needs the keys visible
    S.instTab = "piano";
    localStorage.setItem("ff1roll-inst-tab", "piano");
    if (!S.instOpen) { S.instOpen = true; localStorage.setItem("ff1roll-inst-open", "1"); }
  }
  localStorage.setItem("ff1roll-inst-fall", S.fallOn ? "1" : "0");
  applyInst();
  draw();
});
for (const tab of ["piano", "guitar"]) {
  document.getElementById("insttab-" + tab).addEventListener("click", () => {
    S.instTab = tab;
    localStorage.setItem("ff1roll-inst-tab", S.instTab);
    if (tab === "guitar" && S.fallOn) { // notes can only fall into piano keys
      S.fallOn = false;
      localStorage.setItem("ff1roll-inst-fall", "0");
    }
    applyInst();
    draw();
  });
}
S.instTab = localStorage.getItem("ff1roll-inst-tab") || "piano";
S.instOpen = localStorage.getItem("ff1roll-inst-open") === "1";
// the keyboard's device-local prefs (2026-10-04): gesture mode, lock,
// Sustain, and where the keys were left (a white-key index — null = home)
S.instMode = localStorage.getItem("ff1roll-inst-mode") === "scroll" ? "scroll" : "play";
S.instLock = localStorage.getItem("ff1roll-inst-lock") === "1";
S.instSustain = localStorage.getItem("ff1roll-inst-sustain") === "1";
S.instScroll = (() => { const v = parseFloat(localStorage.getItem("ff1roll-inst-scroll-piano")); return Number.isFinite(v) ? v : null; })();
// Fall is PARKED (Josh, 2026-09-27: opening it killed playback on the iPad — the
// per-frame full redraw starves the note scheduler; "we can re-implement it
// later"). The code stays; the button is hidden and the view never turns on.
S.fallOn = false; // was: localStorage.getItem("ff1roll-inst-fall") === "1" && instTab === "piano"
applyInst();

document.getElementById("ntype").addEventListener("change", applyEditorType);

(function buildChordWidget() {
  const mkRow = (id, items) => {
    const row = document.getElementById(id);
    for (const [v, label] of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.v = v;
      b.textContent = label;
      row.appendChild(b);
    }
  };
  mkRow("nchordroot", "CDEFGAB".split("").map(l => [l, l]));
  mkRow("nchordacc", [["b", "♭"], ["", "♮"], ["#", "♯"]]);
  mkRow("nchordqual", CHORD_BASES.map(q => [q, q]));
  mkRow("nchordext", CHORD_EXTS.map(q => [q, q]));
  const bass = document.getElementById("nchordbass");
  const none = document.createElement("option");
  none.value = ""; none.textContent = "—";
  bass.appendChild(none);
  for (const s of BASS_SPELLINGS) {
    const o = document.createElement("option");
    o.value = s; o.textContent = s;
    bass.appendChild(o);
  }
  document.getElementById("nchordroot").addEventListener("click", e => {
    if (!e.target.dataset.v) return;
    chordSel.root = e.target.dataset.v;
    if (chordSel.base === null) { chordSel.base = "maj"; chordSel.exts = []; }
    refreshChordChips(); composeChord();
  });
  document.getElementById("nchordacc").addEventListener("click", e => {
    if (e.target.dataset.v === undefined) return;
    chordSel.acc = e.target.dataset.v;
    refreshChordChips(); composeChord();
  });
  document.getElementById("nchordqual").addEventListener("click", e => {
    if (!e.target.dataset.v) return;
    chordSel.base = e.target.dataset.v;
    if (chordSel.exts === null) chordSel.exts = [];
    refreshChordChips(); composeChord();
  });
  document.getElementById("nchordext").addEventListener("click", e => { // extensions STACK
    if (!e.target.dataset.v) return;
    if (chordSel.base === null) chordSel.base = "maj";
    const x = e.target.dataset.v, i = chordSel.exts.indexOf(x);
    if (i >= 0) chordSel.exts.splice(i, 1); else chordSel.exts.push(x);
    refreshChordChips(); composeChord();
  });
  bass.addEventListener("change", composeChord);
  const sym = document.getElementById("nchordsym");
  sym.addEventListener("input", () => { // follow hand-edits without rewriting them
    const m = parseChordSym(sym.value);
    chordSel.root = m ? m[1] : null;
    chordSel.acc = m ? m[2] : "";
    const q = m ? chordQualParse(m[3]) : null;
    chordSel.base = q ? q.base : null;
    chordSel.exts = q ? q.exts : [];
    if (m) bass.value = m[4] || "";
    refreshChordChips();
  });
  sym.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("nsave").click(); }
  });
})();

  nmic.addEventListener("click", () =>
  micToggle(nmic, document.getElementById("ntext"), s2 => document.getElementById("nstatus").textContent = s2));

document.getElementById("notebtn").addEventListener("click", () => {
  if (!S.song) return;
  // ALWAYS a new note (Josh, 2026-08-25). It used to reopen whatever
  // annotation the cursor sat on, so a note at 1.1 made the button
  // permanently un-add-able, with no way to tell whether Save would create or
  // overwrite. + Note adds; editing an existing one is a tap in ☰ Notes.
  openEditor(null);
});
document.getElementById("ncancel").addEventListener("click", () => { micStop(true); editor.classList.remove("on"); });
 document.getElementById("ntext").addEventListener("keydown", e => {
  // sections are one-line labels: Enter = save. Text notes keep Enter = newline
  if (e.key === "Enter" && editorType() === "section") {
    e.preventDefault();
    document.getElementById("nsave").click();
  }
});
document.getElementById("nsave").addEventListener("click", () => {
  // P4 (docs/annotations-v2.md): closes P3's known gap — every manual
  // annotation edit refuses on a locked (newer-than-this-app) song, same
  // message as the Ask tool's add/edit_annotation, instead of landing
  // in-memory/localStorage with no way to ever publish it
  if (S.rollnotesReadOnly) { document.getElementById("nstatus").textContent = S.rollnotesLockReason || ROLLNOTES_LOCK_MSG; return; }
  micStop(true); // the text is read now; a late result would land in a closed editor
  const type = editorType();
  const text = document.getElementById("ntext").value.trim();
  if (type === "note" && !text) { document.getElementById("nstatus").textContent = "Note text is empty."; return; }
  const b1 = Math.max(1, +document.getElementById("nb1").value || 1);
  const q1 = Math.max(1, getBeatPair("nq1", "ns1"));
  const b2raw = +document.getElementById("nb2").value || 0;
  const q2raw = document.getElementById("nb2").value === "" ? 0 : getBeatPair("nq2", "ns2");
  if (S.editingNote) retireEdited(S.editingNote);
  let fresh;
  if (type === "key") {
    const [pcS, spS] = document.getElementById("nkeysel").value.split(":");
    const pc = +pcS, sp = spS || "";
    const mode = document.getElementById("nkeymode").value;
    dropLocalKeyAt(b1, q1); // anchor-level: only a key at this exact beat is replaced
    if (mode) {
      const full = keyNameFor(pc, mode);
      fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null,
               text: "key: " + full.name, keydir: full.sf, cnote: text || undefined, added: true};
    } else { // tonic only: stored, not applied — asserted spelling if chosen
      const tonic = sp || tonicLabel(pc);
      fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null,
               text: "key: " + tonic + "?", keypartial: tonic, cnote: text || undefined, added: true};
    }
  } else if (type === "tempo") {
    const bpm = Math.max(20, Math.min(400, +document.getElementById("ntempo").value || 120));
    fresh = {b1, q1, b2: null, q2: null, text: "tempo: " + bpm, tempodir: bpm, cnote: text || undefined, added: true};
  } else if (type === "timesig") {
    const num = +document.getElementById("ntsnum").value, den = +document.getElementById("ntsden").value;
    const oldTs = effTs();
    // bar length OR beat unit changing moves anchors (6/8 counts eighths)
    const tsChanged = num !== oldTs[0] || den !== oldTs[1];
    const others = S.rollnotes.filter(n => !n.tsdir).length;
    if (tsChanged && others > 0 && !S.rebarArmed) {
      S.rebarArmed = true; // big warning, second tap confirms
      document.getElementById("nstatus").textContent =
        "⚠ Re-bar from " + effTs()[0] + "/" + effTs()[1] + " to " + num + "/" + den + "? " +
        others + " annotation(s) will be converted to keep their musical positions. " +
        "Tap Save again to confirm (then Sync to make permanent).";
      return;
    }
    S.rebarArmed = false;
    if (tsChanged) convertAnchors(oldTs, [num, den]);
    S.rollnotes = S.rollnotes.filter(n => !(n.tsdir)); // one meter per song
    fresh = {b1: tsChanged ? 1 : b1, q1: tsChanged ? 1 : q1, b2: null, q2: null,
             text: "timesig: " + num + "/" + den, tsdir: [num, den], cnote: text || undefined, added: true};
  } else if (type === "loop") {
    const lb = Math.max(1, +document.getElementById("nlb").value || 1);
    const lq = getBeatPair("nlq", "nls");
    // one loop point per song: a new one replaces any local one
    S.rollnotes = S.rollnotes.filter(n => !(n.added && n.loopTo !== undefined));
    fresh = {b1, q1, b2: null, q2: null, text: "loop: " + lb + "." + lq, cnote: text || undefined, added: true};
  } else if (type === "chop") {
    const cmode = document.getElementById("nchopmode").value;
    const dispTick = (b1 - 1) * barTicks() + (q1 - 1) * beatTicks();
    const raw = dispTick + S.chopS; // fields are displayed coords; the directive stores raw
    const newS = cmode === "start" ? raw : S.chopS;
    const delta = S.chopS - newS;
    const others = S.rollnotes.filter(n => !n.chopdir).length;
    if (cmode === "start" && delta !== 0 && others > 0 && !S.rebarArmed) {
      S.rebarArmed = true;
      document.getElementById("nstatus").textContent =
        "⚠ Chop the song start here? Bars renumber and " + others +
        " annotation(s) shift to keep their musical positions. Tap Save again to confirm.";
      return;
    }
    S.rebarArmed = false;
    if (cmode === "start" && delta !== 0) shiftAnchors(delta);
    S.rollnotes = S.rollnotes.filter(n => n.chopdir !== cmode); // one chop per side
    const cbt = barTicks();
    fresh = {b1: Math.floor(raw / cbt) + 1, q1: snapBeat((raw % cbt) / beatTicks() + 1),
             b2: null, q2: null, text: "chop: " + cmode, added: true};
  } else if (type === "chord") {
    const sym = document.getElementById("nchordsym").value.trim();
    if (!sym) { document.getElementById("nstatus").textContent = "Chord symbol is empty — tap chips or type one."; return; }
    localStorage.setItem("ff1roll-dragtype", "chord");
    fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null,
             text: sym, chord: true, cnote: text || undefined, added: true};
  } else if (type === "section") {
    const label = document.getElementById("nsectlabel").value.trim();
    if (!label) { document.getElementById("nstatus").textContent = "Section label is empty."; return; }
    localStorage.setItem("ff1roll-dragtype", "section");
    fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null,
             text: label, section: true, added: true,
             cnote: text || undefined};
  } else {
    fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null, text, added: true};
  }
  dropSupersededBy(fresh);
  S.rollnotes.push(resolveNote(fresh));
  S.rangeSel = null;
  finalizeNotes();
  saveLocalNotes();
  buildScoreModel(); // annotations can change signatures/spelling
  clampView();
  S.lastSubtitle = undefined;
  updateSubtitle();
  editor.classList.remove("on");
  draw();
});
document.getElementById("ndelete").addEventListener("click", () => {
  // P4 (docs/annotations-v2.md): closes P3's known gap — see #nsave's own guard
  if (S.rollnotesReadOnly) { document.getElementById("nstatus").textContent = S.rollnotesLockReason || ROLLNOTES_LOCK_MSG; return; }
  // deleting the meter directive re-bars back to neutral 4/4 — same two-tap
  // warning + anchor conversion as declaring one, never a silent move
  if (S.editingNote && S.editingNote.tsdir) {
    const oldTs = effTs(), others = S.rollnotes.filter(n => !n.tsdir).length;
    const tsChanged = oldTs[0] !== 4 || oldTs[1] !== 4;
    if (tsChanged && others > 0 && !S.rebarArmed) {
      S.rebarArmed = true;
      document.getElementById("nstatus").textContent =
        "⚠ Removing the meter re-bars back to neutral 4/4. " + others +
        " annotation(s) will be converted to keep their musical positions. Tap Delete again to confirm.";
      return;
    }
    S.rebarArmed = false;
    if (tsChanged) convertAnchors(oldTs, [4, 4]);
  }
  // removing a start chop restores hidden bars: annotations shift right to stay
  // glued to their music, with the same two-tap warning as re-barring
  if (S.editingNote && S.editingNote.chopdir === "start" && S.chopS) {
    const others = S.rollnotes.filter(n => !n.chopdir).length;
    if (others > 0 && !S.rebarArmed) {
      S.rebarArmed = true;
      document.getElementById("nstatus").textContent =
        "⚠ Removing the start chop restores the hidden bars; " + others +
        " annotation(s) will shift to keep their musical positions. Tap Delete again to confirm.";
      return;
    }
    S.rebarArmed = false;
    shiftAnchors(S.chopS);
  }
  tombstone(S.editingNote); // synced notes need the deletion to survive a reload
  S.rollnotes = S.rollnotes.filter(n => n !== S.editingNote);
  finalizeNotes();
  saveLocalNotes();
  buildScoreModel();
  clampView();
  S.lastSubtitle = undefined;
  updateSubtitle();
  editor.classList.remove("on");
  draw();
});

     // once per launch, a few seconds in (after the boot's own fetches): the
// Publish (N) count is right before the sheet is ever opened
if (typeof window !== "undefined" && !LINK_SONGS) setTimeout(() => { fingerprintOldDrafts().catch(() => {}); }, 4000);
function openVersionsSheet() {
  document.getElementById("versionssheet").classList.add("on");
  renderVersionsSheet();
}
async function goBackToVersion(key, idx) {
  const list = readVersions(key);
  const v = list[idx];
  if (!v) return;
  const label = versionLabel(v);
  const ok = await appConfirm("GO BACK TO " + label.toUpperCase() + "?",
    "Your current state is kept as a version first.", "Go back to this", "Cancel");
  if (!ok) return;
  pushVersion(key, "Before going back"); // list[idx] is still valid after this: pushVersion only appends
  localStorage.setItem(draftStoreKey(key), JSON.stringify(v.draft));
  if (v.notes) localStorage.setItem("ff1roll-notes-" + key, JSON.stringify(v.notes)); else localStorage.removeItem("ff1roll-notes-" + key);
  if (v.ts) localStorage.setItem("ff1roll-ts-" + key, v.ts); else localStorage.removeItem("ff1roll-ts-" + key);
  S.editUndo = []; S.editRedo = [];
  if (key === S.songKey) await openDraft(key);
  document.getElementById("versionssheet").classList.remove("on");
  setInfo("back to " + label + " — your previous state is saved as a version too");
}
function renderVersionsSheet() {
  const box = document.getElementById("versionsrows");
  box.textContent = "";
  const key = S.songKey;
  const row = (label, onGoBack) => {
    const r = document.createElement("div");
    r.className = "noterow";
    const body = document.createElement("span");
    body.className = "body";
    body.textContent = label;
    r.appendChild(body);
    if (onGoBack) {
      const b = document.createElement("button");
      b.className = "fitem";
      b.style.cssText = "flex:none;width:auto";
      b.textContent = "Go back to this";
      b.addEventListener("click", onGoBack);
      r.appendChild(b);
    }
    box.appendChild(r);
    return r;
  };
  if (!key) { row("open a song first"); return; }
  if (catalogHas(key)) row("Published copy", () => goBackToPublished(key));
  const list = readVersions(key);
  if (!list.length && !catalogHas(key)) row("Nothing saved here yet — File → Save Version to start.");
  for (let i = list.length - 1; i >= 0; i--) { // newest first on screen
    const v = list[i];
    row(versionLabel(v), () => goBackToVersion(key, i));
  }
}
async function goBackToPublished(key) { // same door as the Publish sheet's Revert (revertSongToRepo) — same contract: chat included
  const chatKey = "ff1roll-ask-" + key;
  const chatN = askUnsavedCount(chatKey);
  const ok = await appConfirm("GO BACK TO THE PUBLISHED COPY?",
    "Your current state is kept as a version first." + (chatN ? " Drops " + chatN + " unsaved chat message" + (chatN === 1 ? "" : "s") + " too." : ""),
    "Go back to this", "Cancel");
  if (!ok) return;
  dropLocalSong(key);
  askRevertToSaved(chatKey);
  pubCheck.delete(key);
  S.editUndo = []; S.editRedo = [];
  if (key === S.songKey) { S.songKey = null; await loadSong(key); }
  updateSyncBtn();
  updateSongBtn();
  if (typeof asksheet !== "undefined" && asksheet.classList.contains("on") && askStoreKey() === chatKey) askRender();
  document.getElementById("versionssheet").classList.remove("on");
  setInfo("back to the published copy" + (chatN ? " and dropped " + chatN + " chat message" + (chatN === 1 ? "" : "s") : "") + " — your previous state is saved as a version too");
}
function openGridSheet() {
  const row = document.getElementById("gridchips");
  row.innerHTML = "";
  for (const n of [4, 5, 6, 7, 8, 9, 10, 12, 16]) {
    const b = document.createElement("button");
    b.textContent = String(n);
    b.className = "chip" + (S.gridDiv === n ? " selected" : "");
    b.style.cssText = "min-width:52px;min-height:44px;font-size:1.0625rem;justify-content:center" +
      (S.gridDiv === n ? ";background:var(--gold);color:#111;font-weight:700" : "");
    b.addEventListener("click", () => { S.gridDiv = n; syncDurSeg(); draw(); openGridSheet(); });
    row.appendChild(b);
  }
  const ab = document.getElementById("gridab"), aq = document.getElementById("gridaq");
  ab.value = S.gridAnchor.b; aq.value = S.gridAnchor.q;
  const an = document.getElementById("gridanchor");
  an.textContent = !S.gridDiv ? "Grid off — the roll shows the meter's own lines."
    : "Lines run from " + S.gridAnchor.b + "." + S.gridAnchor.q + ", every 1/" + S.gridDiv +
      " of a bar, across the whole song. Bar lines stay visible but don't snap.";
  document.getElementById("gridsheet").classList.add("on");
}
for (const id of ["gridab", "gridaq"]) document.getElementById(id).addEventListener("input", () => {
  const b = Math.max(1, Math.round(+document.getElementById("gridab").value || 1));
  const q = Math.max(1, +document.getElementById("gridaq").value || 1);
  S.gridAnchor = {b, q};
  draw();
  const an = document.getElementById("gridanchor");
  if (S.gridDiv) an.textContent = "Lines run from " + b + "." + q + ", every 1/" + S.gridDiv +
    " of a bar, across the whole song. Bar lines stay visible but don't snap.";
});
document.getElementById("gridoff").addEventListener("click", () => { S.gridDiv = null; syncDurSeg(); draw(); openGridSheet(); });
document.getElementById("gridclose").addEventListener("click", () => {
  document.getElementById("gridsheet").classList.remove("on");
  setInfo(S.gridDiv ? "grid: " + S.gridDiv + " lines/bar — View ▾ → Grid to change" : "grid off");
});
// the rest of Logic's transport keys (DAW review, 2026-09-29: muscle memory
// failed silently): Return = to the start, K = click on/off, C = cycle
// on/off, R = record, ⌘← / ⌘→ = zoom out / in around the cursor. Any song.
document.addEventListener("keydown", e => {
  if (!S.song || e.repeat || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
  const meta = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (meta && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    const f = e.key === "ArrowRight" ? 1.25 : 0.8, ppt0 = pxPerTick(), cx = S.RULER_W + S.playCursor * ppt0 - S.view.x;
    S.view.pxq = Math.min(400, Math.max(S.viewMode === "score" ? minPxq() : pxqFloor(), S.view.pxq * f));
    S.view.x = S.playCursor * pxPerTick() + S.RULER_W - cx; // the cursor stays where it was on screen
    clampView(); draw(); e.preventDefault(); return;
  }
  if (meta || e.shiftKey) return;
  if (e.key === "Enter" && t && (t.tagName === "BUTTON" || t.getAttribute("role") === "button")) return; // Return on a focused button (real or role=button) presses it
  if (e.key === "Enter") { document.getElementById("rwbtn").click(); e.preventDefault(); return; }
  if (k === "k") { document.getElementById("metbtn").click(); e.preventDefault(); return; }
  if (k === "x") { toggleMixer(); e.preventDefault(); return; } // Logic's mixer key
  if (e.key === "Escape" && S.rangeSel) { S.rangeSel = null; setInfo("range cleared"); draw(); return; }
  if (k === "c" && S.rangeSel && S.rangeSel.cycle && S.rangeSel.b > S.rangeSel.a) { S.rangeSel.off = !S.rangeSel.off; setInfo(S.rangeSel.off ? "cycle off" : "cycle on"); draw(); e.preventDefault(); return; }
  if (k === "r") { const rb = document.getElementById("recbtn"); if (rb && rb.offsetParent !== null) { rb.click(); e.preventDefault(); } return; }
  if (k === "q") { // Logic's Q: quantize the selection — only on your own songs
    if (editableSong()) document.getElementById("quantbtn").click(); else setInfo("Quantize works on your own songs");
    e.preventDefault(); return;
  }
});
// VoiceOver/keyboard (2026-09-30): the app's own role="button" elements
// (track-chip M/S/H, the chip itself, the "what's Claude doing" strip, …)
// are <span>/<div>, not real <button>s — a browser gives those no built-in
// Enter/Space activation the way it does a <button>. One delegated listener
// covers every one of them, present and future, the same way SHEET_TOP is
// the one choke point for every sheet.
document.addEventListener("keydown", e => {
  if ((e.key !== "Enter" && e.key !== " ") || e.repeat) return;
  const t = e.target;
  if (!t || t.tagName === "BUTTON" || t.getAttribute("role") !== "button") return;
  e.preventDefault();
  t.click();
});
document.addEventListener("keydown", e => { // space = play/stop, Logic-style
  if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" ||
            t.isContentEditable || t.tagName === "BUTTON" || t.getAttribute("role") === "button")) return; // typing/tabbing wins
  if (!S.song) return;
  e.preventDefault(); // page must not scroll
  if (S.playing) stop(); else document.getElementById("playbtn").click();
});
document.getElementById("viewsheetbtn").addEventListener("click", e => {
  const sheet = document.getElementById("viewsheet");
  if (sheet.classList.contains("on")) { closeFileMenus(); return; }
  closeFileMenus();
  S.vwOpenGroup = null; // sub-menu follow-up, 2026-10-02: every group starts closed, each time View ▾ opens
  renderViewMenu();
  const r = e.currentTarget.getBoundingClientRect();
  sheet.style.left = Math.max(6, Math.min(r.left, songRegionRight() - 250)) + "px";
  sheet.style.top = (r.bottom + 6) + "px";
  sheet.classList.add("on");
});
{ // View toggles flip in place — the menu STAYS OPEN (batch hiding is the use)
  const on = (id, fn) => document.getElementById(id).addEventListener("click", () => { fn(); renderViewMenu(); });
  // Each group header toggles vwOpenGroup accordion-style: tapping the OPEN
  // group's own header closes it (back to null); tapping any other closes
  // whichever was open and opens this one — at most one group's content div
  // is ever visible. Same expanding-row mechanics "View type ▸" always used
  // (ruling #4, 2026-10-01 pm), just generalized to all six (sub-menu
  // follow-up, 2026-10-02, Josh: "View ▾ is too tall — make EVERY section an
  // expanding sub-menu").
  const toggleGroup = key => { S.vwOpenGroup = S.vwOpenGroup === key ? null : key; };
  on("vwViewType", () => toggleGroup("view"));
  on("vwPanels", () => toggleGroup("panels"));
  on("vwTools", () => toggleGroup("tools"));
  on("vwDisplay", () => toggleGroup("display"));
  on("vwBackground", () => toggleGroup("background"));
  on("vwMode", () => toggleGroup("mode"));
  // VIEW group is a radio (Josh, 2026-09-30): each item always SELECTS its
  // mode — no toggle-off — same as the footer's #viewbtn segmented control.
  // "View type ▸" (chrome density follow-up, 2026-10-01 pm): expands/
  // collapses #vwViewTypeRow in place — picking a row below still re-renders
  // (the "on" wrapper) so the ▸/▾ + current-view label stay in sync.
  on("vwRoll", () => setViewMode("roll"));
  on("vwScore", () => setViewMode("score"));
  on("vwListener", () => {
    S.listenerMode = !S.listenerMode;
    localStorage.setItem("ff1roll-listener", S.listenerMode ? "1" : "0");
    applyListener();
  });
  on("vwTracksView", () => setViewMode("tracks"));
  on("vwMixer", () => toggleMixer());
  on("vwLearning", () => { setAppMode(appMode() === "learning" ? "normal" : "learning"); applyMode(); });
  on("vwAnalyze", () => { // Normal-only (the item is absent otherwise) — compute on toggle, never per frame
    if (!analysisAvailable() || !S.song) return;
    S.analysisOn = !S.analysisOn;
    if (S.analysisOn) computeAnalysisLayer(); else { if (S._analysisTimer) { clearTimeout(S._analysisTimer); S._analysisTimer = null; } S.analysisBands = {chords: [], key: null}; }
    finalizeNotes();
    clampView();
    draw();
  });
  on("vwCompare", () => { document.getElementById("viewsheet").classList.remove("on"); if (S.cmp) cmpExit(); else cmpEnter(); });
  on("vwTracks", () => document.getElementById("tracktoggle").click());
  on("vwEdit", () => { S.editrowHidden = !S.editrowHidden; applyChrome(); });
  on("vwAdded", () => { setAddedOutline(!showAddedOutline()); drawFull(); });
  on("vwFooter", () => { S.footerHidden = !S.footerHidden; applyChrome(); });
  on("vwInst", () => document.getElementById("instbtn").click());
  on("vwSub", () => toggleSubtitle());
  on("vwGrid", () => { document.getElementById("viewsheet").classList.remove("on"); openGridSheet(); });
  // BACKGROUND (chrome density follow-up, 2026-10-01 pm): both forward to
  // the footer buttons' own click handlers (renderJobs/errChip's sheets are
  // unchanged) — same "close View ▾ first" convention as vwGrid/vwCompare
  // above, since these open a separate overlay rather than toggling in
  // place. Works even while #jobsbtn/#errbtn are themselves hidden (0 jobs,
  // 0 unread) — a hidden button's own click() still fires.
  on("vwJobs", () => { document.getElementById("viewsheet").classList.remove("on"); document.getElementById("jobsbtn").click(); });
  on("vwMessages", () => { document.getElementById("viewsheet").classList.remove("on"); document.getElementById("errbtn").click(); });
  on("vwLevelsMinus", () => setSecDepth(Math.min(secDepthCap(), S.secMaxDepth - 1) - 1));
  on("vwLevelsPlus", () => setSecDepth(Math.min(secDepthCap(), S.secMaxDepth - 1) + 1));
}
// P6: the Analyze sheet — opened by tapping a band in the Analyze layer
// (tap()); Adopt writes ONE annotation (or all chords) through the existing
// write path, Cancel just closes (nothing is written by looking).
document.getElementById("analyzeadopt").addEventListener("click", () => {
  if (!S.analyzeTarget) return;
  if (S.analyzeTarget.kind === "chord") adoptChordBand(S.analyzeTarget);
  else adoptKeyRegion({start: S.analyzeTarget.start, end: S.analyzeTarget.end, text: S.analyzeTarget.text,
                        name: S.analyzeTarget.text, sf: S.analysisBands.key ? S.analysisBands.key.sf : 0});
  document.getElementById("analyzesheet").classList.remove("on");
});
document.getElementById("analyzeadoptall").addEventListener("click", () => {
  adoptAllChords();
  document.getElementById("analyzesheet").classList.remove("on");
});
document.getElementById("analyzeclose").addEventListener("click", () => document.getElementById("analyzesheet").classList.remove("on"));
document.addEventListener("pointerdown", e => { // tap-away closes the View menu
  const vs = document.getElementById("viewsheet");
  if (vs.classList.contains("on") && !vs.contains(e.target) && e.target.id !== "viewsheetbtn")
    vs.classList.remove("on");
}, {capture: true});
document.getElementById("editsheetbtn").addEventListener("click", e => {
  const sheet = document.getElementById("editsheet");
  if (sheet.classList.contains("on")) { closeFileMenus(); return; }
  closeFileMenus();
  const r = e.currentTarget.getBoundingClientRect();
  sheet.style.left = Math.max(6, Math.min(r.left, songRegionRight() - 250)) + "px";
  sheet.style.top = (r.bottom + 6) + "px";
  sheet.classList.add("on");
});
{ // menu items proxy the edit-row buttons — same guards, same messages
  const proxy = (id, fn) => document.getElementById(id).addEventListener("click", () => { closeFileMenus(); fn(); });
  proxy("emUndo", editUndoPop);
  proxy("emRedo", editRedoPop);
  proxy("emDup", () => document.getElementById("copybtn").click());
  proxy("emPaste", () => document.getElementById("pastebtn").click());
  proxy("emPasteTo", openPasteTo);
  proxy("emCut", () => document.getElementById("cutbtn").click());
  proxy("emDelete", () => document.getElementById("delbtn").click());
  proxy("emSplit", () => document.getElementById("splitbtn").click());
  proxy("emDivide", () => document.getElementById("divbtn").click());
  proxy("emJoin", () => document.getElementById("joinbtn").click());
  proxy("emQuantize", () => document.getElementById("quantbtn").click());
  proxy("emDedupe", () => {
    if (!editableSong()) { setInfo("Remove duplicate notes works on your own songs"); return; }
    const k = removeDuplicateNotes();
    setInfo(k ? "removed " + k + " duplicate note" + (k === 1 ? "" : "s") + " (undo restores them)" : "no duplicate notes in this song");
  });
  proxy("emMove", () => document.getElementById("movebtn").click());
  proxy("emTranspose", () => document.getElementById("trbtn").click());
  proxy("emInsertBars", () => { if (editableSong()) openInsertBars(); else setInfo("Insert bars works on your own songs"); });
  proxy("emDeleteBars", () => { if (editableSong()) openDeleteBars(); else setInfo("Delete bars works on your own songs"); });
  proxy("emChord", () => document.getElementById("insbtn").click());
  proxy("emFill", () => document.getElementById("drumfillbtn").click());
  proxy("emDrummer", () => openDrummer());
  proxy("emBassist", () => openBassist());
}
document.getElementById("filesheetbtn").addEventListener("click", e => {
  if (filesheet.classList.contains("on")) { closeFileMenus(); return; }
  closeFileMenus();
  fileMenuSaveLabels();
  renderOpenRecentRow();
  filesub.classList.remove("on");
  document.getElementById("filenewform").style.display = "none";
  document.getElementById("filesaveasform").style.display = "none";
  document.getElementById("filerenameform").style.display = "none";
  document.getElementById("filemoverow").style.display = isComposition() ? "" : "none";
  document.getElementById("filesavelocal").textContent = S.song && isUnsaved(S.songKey) ? "Save Version…" : "Save Version";
  if (isComposition()) { // move targets: any folder of yours, or a new one
    const sel = document.getElementById("fmdest");
    // name the current home first — a dropdown holding only the OTHER album
    // read as "destination selected" (Josh, 2026-09-07)
    document.getElementById("fmlbl").textContent = "In " + folderTitle(folderOf(S.songKey)) + " · move to";
    fillFolderSelect(sel, folderOf(S.songKey));
    document.getElementById("fmnewfolder").style.display = sel.value === "__new__" ? "" : "none";
  }
  const impN = importDraftKeys().length;
  const impBtn = document.getElementById("fileimpcommit");
  impBtn.style.display = impN ? "" : "none";
  impBtn.textContent = publishLabel("import (" + impN + ")");
  impBtn.disabled = !publishDest();
  { // the rename item names its victim: Rename "Overworld"…
    const t = S.currentPath ? songTitleOf(S.currentPath) : "";
    document.getElementById("filerename").textContent =
      t ? "Rename “" + (t.length > 18 ? t.slice(0, 17) + "…" : t) + "”…" : "Rename…";
  }
  { const origin = S.song && S.songKey ? originOf(S.songKey) : null;
    fileStatus(S.song && isUnsaved(S.songKey) ? "not saved yet — Save names it and picks its folder"
               : isComposition() ? "your song — editable"
               : (origin === "capture" || origin === "starter") ? "read-only here — ✎ Edit (or Save As…) makes an editable copy"
               : "read-only here — Save As makes an editable copy in a folder of yours"); }
  const r = e.currentTarget.getBoundingClientRect();
  filesheet.style.left = Math.max(6, r.left) + "px";
  filesheet.style.top = (r.bottom + 4) + "px";
  filesheet.classList.add("on");
});
document.addEventListener("pointerdown", e => { // tap-away closes, like a real menu
  if (!filesheet.classList.contains("on") && !filesub.classList.contains("on")) return;
  if (filesheet.contains(e.target) || filesub.contains(e.target) || e.target.closest("#filesheetbtn")) return;
  closeFileMenus();
}, {capture: true});
document.getElementById("fmdest").addEventListener("change", () => {
  const isNew = document.getElementById("fmdest").value === "__new__";
  document.getElementById("fmnewfolder").style.display = isNew ? "" : "none";
  if (isNew) document.getElementById("fmnewfolder").focus();
});
document.getElementById("fmgo").addEventListener("click", e => {
  const folder = chosenFolder(document.getElementById("fmdest"), document.getElementById("fmnewfolder"));
  if (!folder) { fileStatus("⚠ Pick a folder, or type a name for a new one."); return; }
  if (!isComposition()) return;
  localStorage.setItem("ff1roll-lastfolder", folder);
  e.currentTarget.disabled = true;
  moveComposition("albums/" + folder + "/").finally(() => { e.currentTarget.disabled = false; });
});
 document.addEventListener("pointerdown", e => { // tap-away closes — exempts the trigger buttons themselves (their own click handler does the toggle-closed, via `was` above) and anything inside the open menu, so a native <select> inside it (#findsel) and its iOS picker stay safe
  if (!S.dropUpOpen) return;
  if (S.dropUpOpen.contains(e.target) || e.target.closest("#viewbtn, #listbtn, #askattach")) return;
  closeDropUp();
}, {capture: true});
JOB_KINDS.publish = {
  label: j => "Publish · " + j.title,
  open: j => openPubJobSheet(j), // the publish dialog (Josh, 2026-09-29: the old jump to File → Open → folder "brought me to a weird page")
  retry: j => { const keys = (j.keys || []).filter(k => importDraftKeys().includes(k)); if (!keys.length) { setInfo(j.title + ": nothing left to publish"); return; } const job = publishJobStart(j.slug, keys, setInfo); if (job) openPubJobSheet(job); },
};
  document.getElementById("fileinst").addEventListener("click", () => {
  closeFileMenus();
  document.getElementById("instsheet").classList.add("on");
  S.instNav = {sys: null, game: null, sub: null};
  renderInstSheet();
});
document.getElementById("fileopen").addEventListener("click", e => {
  const group = Object.entries(S.CATALOG).find(([, songs]) => songs.some(([, p]) => p === S.currentPath));
  if (S.currentPath && localStorage.getItem("ff1roll-draft-" + S.currentPath)) fsubFolder("local", folderOf(S.currentPath)); // the local copy is what's open
  else if (group) fsubFolder("published", folderOf(S.currentPath));
  else fsubAlbums();
  const mr = filesheet.getBoundingClientRect();
  const ir = e.currentTarget.getBoundingClientRect();
  filesub.style.left = Math.min(mr.right + 4, songRegionRight() - 240) + "px";
  filesub.style.top = ir.top + "px";
  filesub.classList.add("on");
});
document.getElementById("fileopenrecent").addEventListener("click", () => {
  S.fileOpenRecentOpen = !S.fileOpenRecentOpen;
  renderOpenRecentRow();
});
document.getElementById("filenew").addEventListener("click", () => {
  document.getElementById("filenewform").style.display = "";
  document.getElementById("filesaveasform").style.display = "none";
  document.getElementById("fnbpm").focus();
});
document.getElementById("fncreate").addEventListener("click", () => {
  stop();
  createComposition(+document.getElementById("fnbpm").value || 120,
                    +document.getElementById("fnnum").value, +document.getElementById("fnden").value);
  document.getElementById("filesheet").classList.remove("on");
  setInfo("new song — Edit → Pencil to write. It lives on this device as " + songTitleOf(S.songKey) + " until File → Save Version names it and picks its folder.");
});
// return key in the name fields = the primary action (iOS keyboards
// otherwise cost an extra tap: the first one just dismisses the keyboard)
document.getElementById("fsname").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); document.getElementById("fsgo").click(); }
});
document.getElementById("fsnewfolder").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); document.getElementById("fsname").focus(); }
});
document.getElementById("fsfolder").addEventListener("change", () => {
  const isNew = document.getElementById("fsfolder").value === "__new__";
  document.getElementById("fsnewfolder").style.display = isNew ? "" : "none";
  if (isNew) document.getElementById("fsnewfolder").focus();
});
document.getElementById("filesaveas").addEventListener("click", () => { if (S.song) openSaveForm("fork"); });
document.getElementById("fsgo").addEventListener("click", async () => {
  const form = document.getElementById("filesaveasform");
  const name = document.getElementById("fsname").value;
  const folder = chosenFolder(document.getElementById("fsfolder"), document.getElementById("fsnewfolder"));
  if (!folder) { fileStatus("⚠ Pick a folder, or type a name for a new one."); document.getElementById("fsnewfolder").focus(); return; }
  if (!name.trim()) { fileStatus("⚠ Name the song."); document.getElementById("fsname").focus(); return; }
  stop();
  if (form.dataset.mode === "editcopy") {
    makeItMine(name, folder);
    document.getElementById("filesheet").classList.remove("on");
    return;
  }
  if (form.dataset.mode === "fork") {
    forkCurrentSong(name, folder);
    document.getElementById("filesheet").classList.remove("on");
    setInfo("copy saved as " + name.trim() + " in " + folderTitle(folder) + " — fully editable; Publish sends it to GitHub.");
    return;
  }
  if (form.dataset.mode === "publish") { // Publish on a song with no folder yet (lotion, 2026-10-03) — publishUnsavedSong is the one place this happens, left open afterward (status line) like ghsave's own writing-mode branch
    const btn = document.getElementById("fsgo");
    btn.disabled = true;
    try { await publishUnsavedSong(folder, name); }
    finally { btn.disabled = false; }
    return;
  }
  if (await saveSongAs(folder, name)) document.getElementById("filesheet").classList.remove("on");
});
// Rename works on EVERYTHING (Josh 2026-08-16): an uncommitted draft renames
// its file; a repo song keeps its filename (analysis docs reference it) and
// gets a display-title override in album.json + the manifest instead
document.getElementById("filerename").addEventListener("click", () => {
  if (!S.songKey) { fileStatus("Nothing to rename — no song open."); return; }
  document.getElementById("filerenameform").style.display = "";
  document.getElementById("filenewform").style.display = "none";
  document.getElementById("filesaveasform").style.display = "none";
  const inp = document.getElementById("frname");
  inp.value = songTitleOf(S.songKey);
  inp.focus();
  inp.select();
});
document.getElementById("frname").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); document.getElementById("frgo").click(); }
});
document.getElementById("frgo").addEventListener("click", async e => {
  const raw = document.getElementById("frname").value.trim();
  if (!raw || !S.songKey) { fileStatus("⚠ Type the new name first."); return; }
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const hasDraft = localStorage.getItem(draftStoreKey(S.songKey)) !== null;
    if (hasDraft && !(S.song && S.song.savedStamp)) { // never committed: rename the file itself
      const newKey = renameImportDraft(S.songKey, raw);
      if (newKey === null) { fileStatus("⚠ A draft named \"" + slugify(raw) + "\" already exists."); return; }
      updateSongBtn();
      fileStatus("Renamed ✓ (local draft — the name commits with it).");
    } else { // repo song: title override, filename untouched
      const token = writeToken();
      if (!token) { fileStatus("No GitHub token stored yet — add one in File → Settings."); return; }
      fileStatus("Renaming…");
      await renameRepoTitle(S.songKey, raw, ghHeaders(token));
      await initCatalog().catch(() => { /* CDN lag; next boot */ });
      // the refetched manifest can be CDN-stale for ~10 min — the repo write
      // succeeded, so patch the in-memory catalog instead of trusting it
      // (Josh renamed Main Theme and the crumb kept saying Main Theme)
      for (const songs of Object.values(S.CATALOG)) {
        const hit = songs.find(([, p]) => p === S.songKey);
        if (hit) hit[0] = raw;
      }
      updateSongBtn();
      fileStatus("Renamed ✓ — \"" + raw + "\" everywhere the dropdown shows it.");
    }
    document.getElementById("filerenameform").style.display = "none";
  } catch (err) { fileStatus("Rename failed: " + err.message); }
  finally { btn.disabled = false; }
});
document.getElementById("editherebtn").addEventListener("click", () => editHereNow());
// ✎ Edit (Josh's ruling, renamed from "✎ Make it mine"): opens the "Edit a
// copy" sheet instead of forking straight away — same destination, one more
// tap to see/change the name and folder first.
document.getElementById("makeitminebtn").addEventListener("click", () => openSaveForm("editcopy"));
document.getElementById("filesavelocal").addEventListener("click", () => { if (S.song && isUnsaved(S.songKey)) { openSaveForm("save"); return; } closeFileMenus(); saveVersion(); });
document.getElementById("filerevert").addEventListener("click", () => {
  if (!S.songKey) { setInfo("open a song first"); return; }
  if (S.songKey.startsWith("local/")) { setInfo("local imports have no repo copy to go back to"); return; }
  closeFileMenus();
  openVersionsSheet();
});
// today's path — kept as the fallback for a browser with no
// OfflineAudioContext, or an offline render that failed: m4a on Safari, webm
// on Chrome, both shareable everywhere. True MP3 would need a bundled
// encoder; the recorder route is dependency-free. Resolves null (after
// saying why) if this browser can record neither way.
function recordRealtimeAudio() {
  return new Promise(resolve => {
    ensureAudio();
    const dest = S.audio.createMediaStreamDestination();
    S.master.connect(dest);
    const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mime) { setInfo("this browser can't record audio — use Download .mid instead"); resolve(null); return; }
    const rec = new MediaRecorder(dest.stream, {mimeType: mime, audioBitsPerSecond: 192000});
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const ext = mime.startsWith("audio/mp4") ? "m4a" : "webm";
    const name = (S.songKey ? S.songKey.split("/").pop().replace(/\.mid$/, "") : "song") + "." + ext;
    rec.onstop = () => { S.master.disconnect(dest); resolve({blob: new Blob(chunks, {type: mime}), name, mime}); };
    stop();
    resumeAudio().then(() => {
      rec.start();
      setInfo("recording " + name + " — plays the song through once, hands off the transport");
      const lenSec = tickToSec(S.song, S.songEndTick) / S.playRate + 1;
      play(0, {noCountIn: true}).then(() => { // a count-in bar recorded as silence (Josh's re-imported export, 2026-09-16)
        setTimeout(() => { if (!S.exporting) return; stop(); rec.stop(); }, Math.min(600, lenSec) * 1000);
      });
    });
  });
}
document.getElementById("filedlaudio").addEventListener("click", async () => {
  if (!S.song) return;
  closeFileMenus();
  if (S.exporting) { setInfo("already exporting — it finishes when the song does"); return; }
  albumClear();
  S.exporting = true;
  let result = null, method = "offline";
  try {
    ensureAudio();
    await resumeAudio();
    const off = await renderSongOffline();
    if (off.ok) {
      result = {blob: new Blob([audioBufferToWav(off.buffer)], {type: "audio/wav"}),
                name: (S.songKey ? S.songKey.split("/").pop().replace(/\.mid$/, "") : "song") + ".wav"};
    } else {
      logDebug("Download audio: offline bounce unavailable (" + off.why + ") — falling back to the real-time recorder");
      method = "realtime";
      result = await recordRealtimeAudio();
    }
  } finally { S.exporting = false; }
  if (!result) return; // recordRealtimeAudio already said why (no MediaRecorder either)
  try { await deliverAudioFile(result.blob, result.name); }
  catch (err) { logErr("Download audio: " + (err && err.message || err)); return; }
  setInfo((method === "offline" ? "audio bounced: " : "audio saved: ") + result.name + " (" + Math.round(result.blob.size / 1024) + " KB)");
});
document.getElementById("filedlmid").addEventListener("click", () => {
  if (!S.song) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([writeMidi(S.song)], {type: "audio/midi"}));
  a.download = (S.songKey ? S.songKey.split("/").pop() : "song.mid");
  a.click();
  URL.revokeObjectURL(a.href);
});
    JOB_KINDS.capture = {
  label: j => "Capture · " + j.title,
  open: j => { // the panel, if this session is still the one; else say what a retry needs
    if (S.nsfSess && S.nsfSess.slug === j.slug) { document.getElementById("importsheet").classList.add("on"); return; }
    setInfo(j.title + ": " + jobProgress(j) + " — the files are no longer open; Import them again to continue (captured tracks are kept)");
  },
  retry: j => { // what is not done, in the same session; a re-import of the same set attaches by slug
    if (!(S.nsfSess && S.nsfSess.slug === j.slug)) { setInfo(j.title + ": Import the same files again, then Capture all — tracks already captured are skipped"); return; }
    const left = (j.ns || []).filter((n, i) => !(j.items[i] && j.items[i].st === "done"));
    if (!left.length) { setInfo(j.title + ": nothing left to capture"); return; }
    document.getElementById("importsheet").classList.add("on");
    captureJobStart(left, impStatus);
  },
};
document.getElementById("impall").addEventListener("click", e => {
  if (!S.nsfSess) return;
  const btn = e.currentTarget; // currentTarget nulls once the dispatch ends — grab it pre-await
  const list = S.nsfSess.trackList || [];
  // re-capture skips what this session already saved (Josh's rule: a re-run overwrites only what it captures)
  const ns = list.map(x => x.n);
  const job = captureJobStart(ns, impStatus);
  if (!job) return;
  btn.disabled = true;
  const off = jobsOnChange(() => {
    if (job.state === "running") { btn.textContent = "⏳ " + jobProgress(job).split(" · ")[0]; return; }
    btn.disabled = false; btn.textContent = "↻ Re-capture all"; off();
  });
});
document.getElementById("impclose").addEventListener("click", () =>
  document.getElementById("importsheet").classList.remove("on")); // captures live on as drafts
document.getElementById("impcommit").addEventListener("click", e => {
  const btn = e.currentTarget;
  const slug = S.nsfSess && S.nsfSess.slug;
  const job = publishJobStart(slug || null, slug ? importDraftKeys().filter(k => k.split("/")[2] === slug) : importDraftKeys(), impStatus);
  if (!job) return;
  btn.disabled = true;
  const off = jobsOnChange(() => { if (job.state === "running") return; off(); btn.disabled = false; });
});
 document.getElementById("fileimpcommit").addEventListener("click", e => {
  const btn = e.currentTarget;
  const job = publishJobStart(null, importDraftKeys(), fileStatus);
  if (!job) return;
  btn.disabled = true;
  const off = jobsOnChange(() => {
    if (job.state === "running") return;
    off();
    btn.disabled = false;
    const n = importDraftKeys().length;
    btn.style.display = n ? "" : "none";
    btn.textContent = publishLabel("import (" + n + ")");
  });
});
document.getElementById("filesave").addEventListener("click", () => {
  // one door for both modes (Josh, 2026-08-18): Save opens the sync sheet, which
  // shows pending annotations; its commit button pushes what the mode owns —
  // compositions: .mid + annotations together; analyzed songs: annotations only
  if (!S.song) return;
  closeFileMenus();
  openSyncSheet();
});
{ // velocity slider: pencil loudness always; with a selection it LIVE-adjusts
  // those notes while dragging and commits ONE undo step on release
  const slider = document.getElementById("velslider"), val = document.getElementById("velval");
  let velSnap = null; // pre-gesture values for the undo entry
  slider.addEventListener("input", () => {
    const v = parseInt(slider.value, 10);
    val.textContent = v;
    S.pencilVel = v;
    if (S.mode !== "select" || !editableSong()) return;
    const items = selEditItems();
    if (!items.length) return;
    if (!velSnap) velSnap = items.map(({ti, ni, n}) => ({ti, ni, t: n.t, d: n.d, p: n.p, v: n.v}));
    for (const it of items) it.n.v = v;
    draw(); // brightness tracks the drag
  });
  slider.addEventListener("change", () => {
    if (!velSnap) return;
    const items = selEditItems();
    if (items.length) {
      selEditApply(items, () => {}, velSnap);
      setInfo("set " + items.length + " note" + (items.length === 1 ? "" : "s") + " to velocity " + slider.value);
    }
    velSnap = null;
  });
}
document.getElementById("copybtn").addEventListener("click", () => {
  const k = copySelection();
  if (!k) { setInfo("nothing selected — lasso or tap notes first"); return; }
  setInfo("copied " + clipSummary() + " — move the cursor anywhere, Paste puts them there");
  updateEditButtons();
});
const DP_PIECES = [["hat", 42], ["snare", 38], ["kick", 36]];  // [piece][step] booleans, rebuilt when meter/grid changes
function dpSteps() { return effTs()[0] * parseInt(document.getElementById("dpdiv").value, 10); }
function dpDefault() { // a sane backbeat for the current meter: kick on 1 (+mid), snare on the even beats, hat everywhere
  const beats = effTs()[0], div = parseInt(document.getElementById("dpdiv").value, 10), n = beats * div;
  const kick = Array(n).fill(false), snare = Array(n).fill(false), hat = Array(n).fill(true);
  kick[0] = true;
  if (beats >= 4) kick[Math.floor(beats / 2) * div] = true;
  for (let b = 1; b < beats; b += 2) snare[b * div] = true;
  return [hat, snare, kick]; // same order as DP_PIECES
}
function dpRender() {
  const n = dpSteps(), div = parseInt(document.getElementById("dpdiv").value, 10);
  if (!S.dpPattern || S.dpPattern[0].length !== n) S.dpPattern = dpDefault();
  const g = document.getElementById("dpgrid");
  g.innerHTML = "";
  DP_PIECES.forEach(([name], pi) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:3px;align-items:center;margin-top:6px";
    const lb = document.createElement("span");
    lb.className = "lbl";
    lb.style.cssText = "width:44px;flex:none";
    lb.textContent = name;
    row.appendChild(lb);
    for (let i = 0; i < n; i++) {
      const c = document.createElement("button");
      c.style.cssText = "flex:1;min-width:0;min-height:40px;padding:0;border-radius:5px;" +
        (i % div === 0 ? "border-width:2px;" : "opacity:.9;");
      c.classList.toggle("primary", S.dpPattern[pi][i]);
      c.textContent = i % div === 0 ? String(i / div + 1) : "·";
      c.addEventListener("click", () => { S.dpPattern[pi][i] = !S.dpPattern[pi][i]; dpRender(); });
      row.appendChild(c);
    }
    g.appendChild(row);
  });
}
document.getElementById("dpdiv").addEventListener("change", dpRender);
function dpBuildBeatSelects() { // bar typed (fills extend past the song's end), beat+sub picked
  const beats = effTs()[0];
  for (const id of ["dpfromq", "dptoq"]) {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    for (let b = 1; b <= beats; b++) {
      const o = document.createElement("option");
      o.value = String(b); o.textContent = String(b);
      sel.appendChild(o);
    }
  }
  for (const id of ["dpfroms", "dptos"]) {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    for (const [f, syl] of [[0, "·"], [0.25, "e"], [0.5, "&"], [0.75, "a"]]) {
      const o = document.createElement("option");
      o.value = String(f); o.textContent = syl;
      sel.appendChild(o);
    }
  }
}
document.getElementById("drumfillbtn").addEventListener("click", () => {
  if (!editableSong()) { setInfo("drum fills work on your own songs — captures are locked"); return; }
  dpBuildBeatSelects();
  const bt = barTicks(), qt = beatTicks();
  document.getElementById("dpfromb").value = Math.floor(S.playCursor / bt) + 1; // cursor's exact spot
  const q = snapBeat((S.playCursor % bt) / qt + 1);
  document.getElementById("dpfromq").value = String(Math.floor(q + 0.03));
  document.getElementById("dpfroms").value = String(Math.round((q - Math.floor(q + 0.03)) * 4) / 4);
  document.getElementById("dptob").value = Math.floor(S.playCursor / bt) + 5;
  document.getElementById("dptoq").value = "1";
  document.getElementById("dptos").value = "0";
  dpRender();
  document.getElementById("drumsheet").classList.add("on");
});
document.getElementById("dpfill").addEventListener("click", () => {
  let di = S.song.tracks.findIndex((_, ti) => trackIsDrums(ti));
  const madeTrack = di < 0, undoLen = S.editUndo.length;
  if (madeTrack) { // no kit yet: create one
    di = addTrackUndoable({name: "drums", notes: []});
    saveDraft(); // the chip path saves; this path silently lost the track on reload
    renderTrackbar();
  }
  const startTick = dpTick("dpfromb", "dpfromq", "dpfroms");
  const endTick = Math.max(startTick + barTicks(), dpTick("dptob", "dptoq", "dptos"));
  const div = parseInt(document.getElementById("dpdiv").value, 10);
  const step = Math.round(beatTicks() / div), bt = barTicks();
  const tr = S.song.tracks[di], isAdd = !isComposition();
  const added = [];
  const passes = Math.ceil((endTick - startTick) / bt); // pattern phase starts AT the from point
  for (let pass = 0; pass < passes; pass++) {
    for (let pi = 0; pi < DP_PIECES.length; pi++) {
      for (let i = 0; i < S.dpPattern[pi].length; i++) {
        if (!S.dpPattern[pi][i]) continue;
        const t = startTick + pass * bt + i * step;
        if (t >= endTick) continue;
        const p = DP_PIECES[pi][1];
        if (tr.notes.some(n => !n.gone && n.t === t && n.p === p)) continue; // don't stack over an existing hit
        tr.notes.push({t, d: Math.max(30, Math.round(step / 2)), p, v: S.pencilVel, added: isAdd});
        if (S.song.rawNotes) S.song.rawNotes[di].push({t: t + S.chopS, d: Math.max(30, Math.round(step / 2)), p, v: S.pencilVel, added: isAdd});
        added.push({ti: di, ni: tr.notes.length - 1});
      }
    }
  }
  if (added.length) {
    pushUndo({kind: "addBatch", items: added});
  if (madeTrack) undoTrackAdd(di, undoLen); // the new kit leaves with its fill
    saveEdits();
    computeSongEnd();
    if (S.viewMode === "score") buildScoreModel();
    S.view.y = 1e9; // the kit lane hangs below the pitch rows — scroll it into view,
    clampView();  // or a first fill looks like nothing happened (Josh)
    draw();
  }
  document.getElementById("drumsheet").classList.remove("on");
  setInfo(added.length ? "filled " + added.length + " drum hits from bar " + (Math.floor(startTick / barTicks()) + 1) + " (one undo undoes the fill)"
                       : "nothing to fill — pattern is empty or those hits already exist");
});

 document.getElementById("bassistbtn").addEventListener("click", openBassist);
document.getElementById("bsgen").addEventListener("click", () => {
  const r = bsRange();
  let targetTi = document.getElementById("bstarget").value;
  const madeTrack = targetTi === "new", undoLen = S.editUndo.length;
  if (madeTrack) {
    targetTi = addTrackUndoable({name: "bass", notes: []});
    saveDraft();
    renderTrackbar();
    // rebuild the pickers so the new track is selectable next time
    const tsel = document.getElementById("bstarget");
    const o = document.createElement("option"); o.value = String(targetTi); o.textContent = "bass";
    tsel.insertBefore(o, tsel.lastElementChild);
    tsel.value = String(targetTi);
  } else targetTi = parseInt(targetTi, 10);
  const fv = document.getElementById("bsfollow").value;
  const opts = {
    style: segGet("bsstyle"), busy: parseInt(segGet("bsbusy"), 10) || 3,
    oct: parseInt(segGet("bsoct"), 10) || 2,
    follow: fv, targetTi,
    fromBar: r.from, toBar: r.to, t0: r.t0, t1: r.t1,
  };
  const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  const k = bsGenerate(seed, opts);
  if (madeTrack) undoTrackAdd(targetTi, undoLen); // the new bass track is part of the same undo step
  if (!k) { bsRefresh(); return; }
  S.bsTakes.push({seed, opts, style: opts.style, busy: opts.busy, oct: opts.oct,
                followSel: fv, targetTi,
                from: parseInt(document.getElementById("bsfrom").value, 10) || 1,
                to: parseInt(document.getElementById("bsto").value, 10) || 1,
                q: [getBeatPair("bsfromq", "bsfroms"), getBeatPair("bstoq", "bstos")]});
  if (S.bsTakes.length > 8) S.bsTakes.shift();
  S.bsActive = S.bsTakes.length - 1;
  bsRefresh();
  setInfo("take " + S.bsTakes.length + ": " + k + " bass notes in " + fmtBarBeat(r.t0) + "–" + fmtBarBeat(r.t1) + " (one undo restores what was there)");
});
for (const id of ["bsfrom", "bsto"]) document.getElementById(id).addEventListener("input", bsRefresh);
for (const id of ["bsfromq", "bsfroms", "bstoq", "bstos", "bstarget", "bsfollow"]) document.getElementById(id).addEventListener("change", bsRefresh);
function segGet(id) { const a = document.querySelector("#" + id + " button.active"); return a ? a.dataset.v : null; }
document.getElementById("drgen").addEventListener("click", () => {
  const r = drRange();
  const opts = {
    busy: parseInt(segGet("drbusy"), 10) || 3,
    hard: parseInt(segGet("drhard"), 10) || 3,
    fillAmt: (v => isNaN(v) ? 3 : v)(parseInt(segGet("drfills"), 10)),
    parts: drPartsGet(),
    follow: (v => v.startsWith("t") ? "bass" : v)(document.getElementById("drfollow").value),
    followTi: (v => v.startsWith("t") ? parseInt(v.slice(1), 10) : undefined)(document.getElementById("drfollow").value),
    feel: segGet("drfeel"),
    fromBar: r.from, toBar: r.to, t0: r.t0, t1: r.t1,
  };
  if (!opts.parts.length) { setInfo("pick at least one part"); return; }
  const seed = (Math.random() * 0xFFFFFFFF) >>> 0; // the ONLY nondeterminism; takes replay it exactly
  const k = drGenerate(seed, opts);
  if (!k) { drRefresh(); return; }
  S.drTakes.push({seed, ...opts,
                from: parseInt(document.getElementById("drfrom").value, 10) || 1,
                to: parseInt(document.getElementById("drto").value, 10) || 1,
                q: [getBeatPair("drfromq", "drfroms"), getBeatPair("drtoq", "drtos")]});
  if (S.drTakes.length > 8) S.drTakes.shift();
  S.drActive = S.drTakes.length - 1;
  drRefresh();
  setInfo("take " + S.drTakes.length + ": " + k + " hits in " + fmtBarBeat(r.t0) + "–" + fmtBarBeat(r.t1) + " (one undo restores what was there)");
});
for (const id of ["drfrom", "drto"]) document.getElementById(id).addEventListener("input", drRefresh);
for (const id of ["drfromq", "drfroms", "drtoq", "drtos", "drfollow"]) document.getElementById(id).addEventListener("change", drRefresh);
document.getElementById("drummerbtn").addEventListener("click", openDrummer);
document.getElementById("movebtn").addEventListener("click", () => {
  if (!editableSong()) { setInfo("editing works on your own songs — captures are locked"); return; }
  const box = document.getElementById("mvtracks");
  box.innerHTML = S.song.tracks.map((tr, ti) =>
    '<button data-mv="' + ti + '" style="min-height:44px"' + (ti === S.selTrack ? ' class="primary"' : '') + '>' +
    (tr.name || "track " + (ti + 1)) + '</button>').join("");
  // selection spanning several tracks (unison doubles): offer a source filter,
  // so Josh moves ONLY pulse2's copy instead of both (2026-08-18)
  S.mvFromFilter = null;
  const counts = new Map();
  for (const {ti} of selEditItems()) counts.set(ti, (counts.get(ti) || 0) + 1);
  const fromRow = document.getElementById("mvfromrow"), from = document.getElementById("mvfrom");
  if (counts.size > 1) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    from.innerHTML = '<button data-mf="all" class="primary" style="min-height:44px">all (' + total + ')</button>' +
      [...counts.entries()].map(([ti, n]) =>
        '<button data-mf="' + ti + '" style="min-height:44px">' +
        (S.song.tracks[ti].name || "track " + (ti + 1)) + " (" + n + ")</button>").join("");
    fromRow.style.display = "";
  } else fromRow.style.display = "none";
  document.getElementById("movesheet").classList.add("on");
});
document.getElementById("mvfrom").addEventListener("click", e => {
  const b = e.target.closest("button[data-mf]");
  if (!b) return;
  S.mvFromFilter = b.dataset.mf === "all" ? null : +b.dataset.mf;
  for (const x of document.querySelectorAll("#mvfrom button")) x.classList.toggle("primary", x === b);
});
document.getElementById("mvtracks").addEventListener("click", e => {
  const b = e.target.closest("button[data-mv]");
  if (!b) return;
  const k = moveSelectionToTrack(+b.dataset.mv);
  document.getElementById("movesheet").classList.remove("on");
  setInfo(k ? "moved " + k + " note" + (k === 1 ? "" : "s") + " to " + (S.song.tracks[+b.dataset.mv].name || "track")
            : "select notes first (lasso or tap), then ⇄");
});
document.getElementById("mvdedupe").addEventListener("click", () => {
  const k = dedupeSong();
  document.getElementById("movesheet").classList.remove("on");
  setInfo(k ? "removed " + k + " duplicate note" + (k === 1 ? "" : "s") + " — SAVE to make it stick (undo restores them)"
            : "no duplicates found anywhere");
});
function openPasteTo() {
  if (!editableSong()) { setInfo("paste works on your own songs — captures are locked"); return; }
  if (!clipboardHas()) { setInfo("nothing copied yet — select notes and tap Copy (or ⌘C) first"); return; }
  S.ptTarget = S.selTrack;
  const box = document.getElementById("pttracks");
  box.innerHTML = S.song.tracks.map((tr, ti) =>
    '<button data-pt="' + ti + '" style="min-height:44px"' + (ti === S.ptTarget ? ' class="primary"' : '') + '>' +
    (tr.name || "track " + (ti + 1)) + '</button>').join("");
  document.getElementById("pastesheet").classList.add("on");
}
document.getElementById("pttracks").addEventListener("click", e => {
  const b = e.target.closest("button[data-pt]");
  if (!b) return;
  S.ptTarget = +b.dataset.pt;
  for (const x of document.querySelectorAll("#pttracks button")) x.classList.toggle("primary", +x.dataset.pt === S.ptTarget);
});
document.getElementById("ptgo").addEventListener("click", () => {
  const oct = parseInt(document.getElementById("ptoct").value, 10) || 0;
  const semi = Math.max(-24, Math.min(24, parseInt(document.getElementById("ptsemi").value, 10) || 0));
  const k = pasteClipboard(S.playCursor, {ti: S.ptTarget, dP: oct * 12 + semi});
  if (!k) { setInfo("nothing landed — every note was already there or shifted off the roll"); return; }
  S.selTrack = S.ptTarget; renderTrackbar(); draw();
  document.getElementById("pastesheet").classList.remove("on");
  const shift = (oct ? (oct > 0 ? "+" : "") + oct + " oct" : "") + (semi ? (oct ? " " : "") + (semi > 0 ? "+" : "") + semi + " st" : "");
  setInfo("pasted " + k + " note" + (k === 1 ? "" : "s") + " onto " + (S.song.tracks[S.ptTarget].name || "track") + (shift ? " (" + shift + ")" : "") + " — selected, cursor at their end");
});
document.getElementById("pastebtn").addEventListener("click", () => {
  if (!editableSong()) { setInfo("paste works on your own songs — captures are locked"); return; }
  const k = pasteClipboard(S.playCursor); // pastes the last ⧉/⌘C copy — surviving any scrolling
  setInfo(k ? "pasted " + clipSummary() + " — cursor moved to their end, paste again to chain"
            : "nothing copied yet — select notes and tap Copy (or ⌘C) first");
});
document.getElementById("octupbtn").addEventListener("click", () => {
  if (nudgeSelection(0, 12)) setInfo("selection up an octave (undo undoes)");
  else setInfo("nothing selected — lasso or tap notes first");
});
document.getElementById("octdownbtn").addEventListener("click", () => {
  if (nudgeSelection(0, -12)) setInfo("selection down an octave (undo undoes)");
  else setInfo("nothing selected — lasso or tap notes first");
});
// ⋯ folds the less-used tools (Josh, 2026-08-22: pencil mode wrapped the row)
{
  const wrap2 = document.getElementById("morewrap");
  const open = localStorage.getItem("ff1roll-editmore") === "1";
  wrap2.style.display = open ? "inline-flex" : "none";
  document.getElementById("morebtn").classList.toggle("active", open);
  document.getElementById("morebtn").addEventListener("click", () => {
    const on = wrap2.style.display === "none";
    wrap2.style.display = on ? "inline-flex" : "none";
    document.getElementById("morebtn").classList.toggle("active", on);
    localStorage.setItem("ff1roll-editmore", on ? "1" : "0");
  });
}
document.getElementById("trbtn").addEventListener("click", () => {
  if (!selEditItems().length) { setInfo("select notes first — then ⇅ transposes them"); return; }
  const row = document.getElementById("trchips");
  if (!row.children.length) {
    const mk = (label, fn) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "flex:1;min-height:44px";
      b.addEventListener("click", fn);
      row.appendChild(b);
    };
    mk("−2", () => nudgeSelection(0, -2) && setInfo("down a whole step (chromatic)"));
    mk("−1", () => nudgeSelection(0, -1) && setInfo("down a half step"));
    mk("+1", () => nudgeSelection(0, 1) && setInfo("up a half step"));
    mk("+2", () => nudgeSelection(0, 2) && setInfo("up a whole step (chromatic)"));
    mk("in key ▼", () => diatonicShift(-1) && setInfo("down one scale degree — still in key"));
    mk("in key ▲", () => diatonicShift(1) && setInfo("up one scale degree — still in key"));
    mk("▼ 8va", () => nudgeSelection(0, -12) && setInfo("down an octave"));
    mk("▲ 8va", () => nudgeSelection(0, 12) && setInfo("up an octave"));
  }
  document.getElementById("trsheet").classList.add("on");
});
document.getElementById("divbtn").addEventListener("click", () => {
  if (!selEditItems().length) { setInfo("select notes first — then ➗ divides each into equal parts"); return; }
  const row = document.getElementById("divchips");
  if (!row.children.length) {
    for (const n of [2, 3, 4, 5, 6, 7]) {
      const b = document.createElement("button");
      b.textContent = String(n);
      b.style.cssText = "flex:1;min-height:44px;font-size:1.0625rem";
      b.addEventListener("click", () => {
        const k = divideSelection(n);
        document.getElementById("divsheet").classList.remove("on");
        setInfo(k ? "divided " + k + " note" + (k === 1 ? "" : "s") + " into " + n + " (one undo undoes)"
                  : "those notes are too short to divide by " + n);
      });
      row.appendChild(b);
    }
  }
  document.getElementById("divsheet").classList.add("on");
});
document.getElementById("quantbtn").addEventListener("click", () => {
  if (!selEditItems().length) { setInfo("select notes first — then Q quantizes them to the grid"); return; }
  const row = document.getElementById("quantchips");
  if (!row.children.length) {
    for (const pct of [100, 75, 50]) {
      const b = document.createElement("button");
      b.textContent = pct + "%";
      b.style.cssText = "flex:1;min-height:44px;font-size:1.0625rem";
      b.addEventListener("click", () => {
        const alsoEnds = document.getElementById("quantends").checked;
        const k = quantizeSelection(pct / 100, alsoEnds);
        document.getElementById("quantsheet").classList.remove("on");
        setInfo(k ? "quantized " + k + " note" + (k === 1 ? "" : "s") + " at " + pct + "% (one undo undoes)"
                  : "nothing to quantize");
      });
      row.appendChild(b);
    }
  }
  document.getElementById("quantsheet").classList.add("on");
});
document.getElementById("cutbtn").addEventListener("click", () => {
  const k = cutSelection();
  if (!k) { setInfo("nothing selected — lasso or tap notes first"); return; }
  setInfo("cut " + clipSummary() + " — Paste puts them at the cursor (undo restores)");
});
document.getElementById("splitbtn").addEventListener("click", () => {
  if (S.selClip && !S.multiSel.length && editableSong()) { splitSelectedClipAtCursor(); return; } // a selected audio piece splits like a note would
  let k = splitSelectionAt(S.playCursor), how = "at the cursor";
  if (!k) { k = splitSelectionHalves(); how = "in half"; }
  setInfo(k ? "split " + k + " note" + (k === 1 ? "" : "s") + " " + how
            : "select notes first — cursor inside splits there, otherwise each splits in half");
});
document.getElementById("joinbtn").addEventListener("click", () => {
  const k = joinSelection();
  setInfo(k ? "joined " + k + " notes"
            : "select two or more notes on the same pitch first");
});
document.getElementById("delbtn").addEventListener("click", () => {
  const k = deleteSelection();
  setInfo(k ? "deleted " + k + " note" + (k === 1 ? "" : "s") + " (undo restores them)"
            : "nothing selected — lasso or tap notes first");
});
 document.getElementById("undobtn").addEventListener("click", editUndoPop);
document.getElementById("redobtn").addEventListener("click", editRedoPop);
// keyboard editing — every drag gesture has a key equivalent (easier on the
// hands): arrows move, shift = octave, alt+arrows resize, cmd-c/v copy/paste
// at the playhead, delete removes. Ignored while typing in a field.
document.addEventListener("keydown", e => {
  if (!S.song || !editableSong()) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  const grid = moveSnapTicks(); // 16ths, or triplet steps while a T duration is active
  const meta = e.metaKey || e.ctrlKey;
  if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); saveVersion(); return; }
  if (meta && e.key.toLowerCase() === "c") {
    const k = copySelection();
    if (k) { setInfo("copied " + clipSummary() + " — ⌘V pastes at the playhead"); e.preventDefault(); }
    return;
  }
  if (meta && e.key.toLowerCase() === "v") {
    const k = pasteClipboard(S.playCursor);
    if (k) { setInfo("pasted " + clipSummary() + " (selected — arrows move them; cursor at their end, ⌘V again chains)"); e.preventDefault(); }
    return;
  }
  if (meta && e.key.toLowerCase() === "z") { // ⌘Z / ⇧⌘Z (Josh, 2026-09-12: ⌘Z did nothing on his Mac)
    if (e.shiftKey) editRedoPop(); else editUndoPop();
    e.preventDefault();
    return;
  }
  if (meta && e.key.toLowerCase() === "y") { editRedoPop(); e.preventDefault(); return; }
  if (meta && e.key.toLowerCase() === "a") { const k = selectAllNotes(); setInfo(k + " notes selected"); e.preventDefault(); return; }
  if (meta && e.key.toLowerCase() === "x") { // cut = copy, then delete — one ⌘Z brings the notes back
    if (copySelection()) { const s = clipSummary(); deleteSelection(); setInfo("cut " + s + " — ⌘V pastes at the playhead"); e.preventDefault(); }
    return;
  }
  if (meta && e.key.toLowerCase() === "d") { if (duplicateSelection()) setInfo("duplicated — ⌘D again repeats it"); e.preventDefault(); return; }
  if (meta) return; // don't eat browser shortcuts
  if (e.key === "Backspace" || e.key === "Delete") {
    if (deleteSelection()) e.preventDefault();
    return;
  }
  if (!selEditItems().length) return;
  let did = false;
  if (e.key === "ArrowUp") did = nudgeSelection(0, e.shiftKey ? 12 : 1);
  else if (e.key === "ArrowDown") did = nudgeSelection(0, e.shiftKey ? -12 : -1);
  else if (e.key === "ArrowLeft") did = e.altKey ? resizeSelection(-grid) : nudgeSelection(-grid, 0);
  else if (e.key === "ArrowRight") did = e.altKey ? resizeSelection(grid) : nudgeSelection(grid, 0);
  if (did) e.preventDefault();
});
{
  const fn = document.getElementById("fnnum");
  for (let n = 2; n <= 12; n++) {
    const o = document.createElement("option");
    o.textContent = String(n);
    if (n === 4) o.selected = true;
    fn.appendChild(o);
  }
}

 if (document.getElementById("cmpswap")) {
  document.getElementById("cmpswap").addEventListener("click", () => cmpShow(S.cmp && S.cmp.showing === "mine" ? "repo" : "mine"));
  document.getElementById("cmpdone").addEventListener("click", cmpExit);
}


         document.getElementById("cfgaitest").addEventListener("click", aiRunTest);
document.getElementById("cfgaitestb").addEventListener("click", aiRunTest);
document.getElementById("cfgaiurl").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); aiRunTest(); } });
document.getElementById("cfgaibackend").addEventListener("change", aiBackendRows);


   // what the configured backend can do (askStatusPoll detects; askTabsApply shows). sessions: the bridge's Clear-really-resets/Compact/usage-line trio (askSessionRender gates on it)
try { const m = localStorage.getItem("ff1roll-ask-mode"); S.askTerminal = m === "terminal"; S.askGeneral = S.askTerminal || m === "general"; } catch (err) { S.askGeneral = S.askTerminal = false; }
  
      document.addEventListener("visibilitychange", () => { if (document.hidden) flushBackupNow(); });


document.getElementById("deploynotnow").addEventListener("click", deployHoldNow);
document.getElementById("deploynow").addEventListener("click", deployInstallNow);
   document.getElementById("askcompact").addEventListener("click", async () => {
  const key = askSessionName();
  const u = S.askSessionCache[key];
  if (!u || !u.turns) return;
  const yes = await appConfirm("Compact chat", "Summarize this chat's memory on the bridge and shrink it — " + askSessionLine(u) + " now. This can't be undone.", "Compact", "Cancel");
  if (!yes) return;
  const btn = document.getElementById("askcompact");
  btn.disabled = true;
  askstatus.textContent = "compacting…";
  try {
    const r = await fetch(aiUrl() + "/v1/sessions/" + encodeURIComponent(key) + "/compact", {method: "POST", headers: aiHeaders(), body: JSON.stringify({model: askCompactModelName()})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || "HTTP " + r.status);
    askSentReset(askStoreKey()); // the compacted session no longer holds the full text verbatim — resend in full next time
    const k = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n);
    askstatus.textContent = "compacted: " + j.turnsBefore + " → " + j.turnsAfter + " turns · ~" + k(j.tokensBefore) + " → ~" + k(j.tokensAfter) + " tokens";
  } catch (err) { askstatus.textContent = "⚠ Compact failed — " + err.message; }
  await askSessionRefresh();
});
// live while the bridge is there and the app is on screen: every 10 s (the
// inbox keeps its own 60 s pace)
// (askStatusPoll asks only an allowed host, and never again after a 404 —
// so for LM Studio or no AI at all this costs one request, then nothing)
if (typeof window !== "undefined") setInterval(() => { if (!document.hidden) askStatusPoll(); }, 10000);
 document.getElementById("askattach").addEventListener("click", () => {
  const btn = document.getElementById("askattach"), menu = document.getElementById("askattachmenu");
  const was = S.dropUpOpen === menu && menu.classList.contains("on");
  closeFileMenus();
  if (was) return;
  const r = btn.getBoundingClientRect();
  menu.style.left = Math.max(6, Math.min(r.right - 240, window.innerWidth - 246)) + "px"; // right-aligned to ＋: it sits at the AI window's right edge
  menu.style.bottom = (wmInnerHeight() - r.top + 6) + "px";
  menu.classList.add("on");
  S.dropUpOpen = menu;
});
document.getElementById("askattachmenu").addEventListener("click", () => closeDropUp(), {capture: true}); // the item's own handler still runs
document.getElementById("askshot").addEventListener("click", askShotTake);
document.getElementById("askshotx").addEventListener("click", () => { askShotClearAll(); askstatus.textContent = ""; });
document.getElementById("askpick").addEventListener("click", () => document.getElementById("askpickfile").click());
document.getElementById("askpickfile").addEventListener("change", e => {
  // copy BEFORE clearing: e.target.files is live, and WebKit empties it when
  // value is reset — the picker then "did nothing" (Josh, 2026-10-03, iPad)
  const files = Array.from(e.target.files || []); e.target.value = ""; askPickFiles(files);
});
if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("visibilitychange", () => { if (document.hidden) askDraftSave(); });
  if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("pagehide", askDraftSave);
}
  for (const [id, k] of [["asktermadvisor", "advisor"], ["asktermbuilder", "builder"]]) document.getElementById(id).addEventListener("change", async e => {
  try { await fetch(aiUrl() + "/v1/terminal-prefs", {method: "POST", headers: aiHeaders(), body: JSON.stringify({[k]: e.target.value})}); askstatus.textContent = k + "s will use " + e.target.value; }
  catch (err) { askstatus.textContent = "⚠ couldn't reach the bridge: " + err.message; }
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) { askResumeSoon(300); askInboxPoll(); } });
askInboxStart();
// Drag any sheet by its title line (and the capture panel by its title row).
// The offset lives in a transform so the overlay's centering still applies;
// it resets each time the sheet opens. Pointer capture keeps the drag alive
// when the finger leaves the title.
(function sheetDrag() {
  if (typeof document === "undefined" || !document.body) return;
  const handleFor = t => {
    if (t.closest && t.closest("button")) return null; // never start a drag from a button tap (a window's Dock control lives inside its h2)
    const h2 = t.closest && t.closest(".sheet > h2");
    if (h2) return {handle: h2, box: h2.parentElement};
    const row = t.closest && t.closest("#importsheet .row:first-child");
    if (row) return {handle: row, box: document.getElementById("importsheet")};
    return null;
  };
  let drag = null, size = null;
  // the ◢ grip on every sheet and on the capture panel (Josh, 2026-09-27: "resize them too by clicking in the corner")
  const addGrips = () => { for (const box of [...document.querySelectorAll(".sheet"), document.getElementById("importsheet") && document.getElementById("importsheet").querySelector(".metpanel")]) { if (!box || box.querySelector(":scope > .sheetgrip")) continue; const g = document.createElement("div"); g.className = "sheetgrip"; g.textContent = "◢"; g.setAttribute("aria-label", "Resize"); box.appendChild(g); } };
  addGrips();
  document.addEventListener("pointerdown", e => {
    if (e.button && e.button !== 0) return;
    const grip = e.target.closest && e.target.closest(".sheetgrip");
    if (grip) {
      // a docked sheet is fixed by the dock, not by drag-and-resize — its
      // divider resizes it instead
      if (e.target.closest && e.target.closest(".overlay.docked")) return;
      const box = grip.parentElement.classList.contains("metpanel") ? document.getElementById("importsheet") : grip.parentElement;
      const r = box.getBoundingClientRect();
      // a centered sheet grows out from its middle, so the top-left drifts up
      // and off the screen (Josh, 2026-09-27); hold the corner still by
      // translating half the growth. The capture panel is absolutely placed
      // and grows down-right on its own.
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(box.style.transform || "");
      size = {box, x0: e.clientX, y0: e.clientY, w0: r.width, h0: r.height, id: e.pointerId,
              tx: m ? +m[1] : 0, ty: m ? +m[2] : 0, centered: box.id !== "importsheet"};
      try { grip.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      e.preventDefault(); return;
    }
    const hit = handleFor(e.target);
    if (!hit || !hit.box) return;
    // Phase B (drag-to-dock): a DOCKED window's title now also arms a drag —
    // it's undocked once the drag crosses the threshold below (a plain tap
    // must not rip it out of its dock).
    const overlay = hit.box.closest && hit.box.closest(".overlay");
    const wasDocked = !!(overlay && overlay.classList.contains("docked"));
    const wmId = overlay && overlay.id;
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(hit.box.style.transform || "");
    drag = {box: hit.box, x0: e.clientX, y0: e.clientY, dx: m ? +m[1] : 0, dy: m ? +m[2] : 0, id: e.pointerId,
            wasDocked, wmId, moved: false, zone: null};
    if (!wasDocked) hit.box.classList.add("dragging");
    try { hit.handle.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    e.preventDefault();
  }, {capture: true});
  document.addEventListener("pointermove", e => {
    if (size && e.pointerId === size.id) {
      const w = Math.max(280, Math.round(size.w0 + e.clientX - size.x0)), h = Math.max(160, Math.round(size.h0 + e.clientY - size.y0));
      size.box.style.width = w + "px"; size.box.style.maxWidth = "none"; size.box.style.height = h + "px"; size.box.style.maxHeight = "none";
      if (size.centered) size.box.style.transform = "translate(" + Math.round(size.tx + (w - size.w0) / 2) + "px, " + Math.round(size.ty + (h - size.h0) / 2) + "px)";
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.wasDocked && !drag.moved) {
      // a tap on a docked title must not undock it — only a real drag does
      // (the app's own 8px gesture threshold, reused here for drag-to-dock)
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
      drag.moved = true;
      drag.box.classList.add("dragging");
      wmFloat(drag.wmId); // undock — its node moves back to its floating home
      drag.box.style.transform = ""; // measure the floating (centered) position it just landed at…
      const r = drag.box.getBoundingClientRect();
      drag.dx = e.clientX - (r.left + r.width / 2); drag.dy = e.clientY - (r.top + r.height / 2); // …so the drag continues under the SAME finger position instead of jumping to center
      drag.x0 = e.clientX; drag.y0 = e.clientY;
    } else if (!drag.moved) {
      drag.moved = true; // a floating window: unchanged behavior — moves from the very first pixel
    }
    drag.box.style.transform = "translate(" + Math.round(drag.dx + e.clientX - drag.x0) + "px, " + Math.round(drag.dy + e.clientY - drag.y0) + "px)";
    if (drag.wmId && WM_WINDOWS[drag.wmId] && WM_WINDOWS[drag.wmId].dockable) {
      drag.zone = wmZoneForPointer(e.clientX, e.clientY);
      wmShowDropZone(drag.zone);
    }
  });
  // where you left a sheet is where it reopens, on this device (Josh,
  // 2026-09-27): translate + size per overlay id, a UI pref in localStorage
  const sheetKey = box => { const ov = box.id === "importsheet" ? box : box.closest(".overlay"); return ov && ov.id ? "ff1roll-sheetpos-" + ov.id : null; };
  const remember = box => {
    const k = sheetKey(box); if (!k) return;
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(box.style.transform || "");
    const rec = {tx: m ? +m[1] : 0, ty: m ? +m[2] : 0, w: box.style.width || "", h: box.style.height || ""};
    try { localStorage.setItem(k, JSON.stringify(rec)); } catch (err) { /* private mode */ }
  };
  const restore = box => { // the saved spot, nudged back on screen if the window shrank; nothing saved = centered, as before
    box.style.transform = ""; box.style.width = ""; box.style.height = ""; box.style.maxWidth = ""; box.style.maxHeight = "";
    const k = sheetKey(box); let rec = null;
    try { rec = k && JSON.parse(localStorage.getItem(k) || "null"); } catch (err) { rec = null; }
    if (!rec) return;
    if (rec.w) { box.style.width = rec.w; box.style.maxWidth = "none"; }
    if (rec.h) { box.style.height = rec.h; box.style.maxHeight = "none"; }
    box.style.transform = "translate(" + rec.tx + "px, " + rec.ty + "px)";
    // measured right away (the overlay is already display:flex here); an
    // animation frame would never come in a hidden tab
    const r = box.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    if (!r.width) return;
    let dx = 0, dy = 0;
    if (r.right > W - 8) dx = W - 8 - r.right; if (r.left + dx < 8) dx += 8 - (r.left + dx);
    if (r.bottom > H - 8) dy = H - 8 - r.bottom; if (r.top + dy < 8) dy += 8 - (r.top + dy);
    if (dx || dy) box.style.transform = "translate(" + Math.round(rec.tx + dx) + "px, " + Math.round(rec.ty + dy) + "px)";
  };
  const end = e => {
    if (size && (!e || e.pointerId === size.id)) { remember(size.box); size = null; }
    if (drag && (!e || e.pointerId === drag.id)) {
      drag.box.classList.remove("dragging");
      wmHideDropZone();
      // released over a drop zone (drag-to-dock): dock there instead of
      // remembering a floating position
      if (drag.moved && drag.zone && drag.wmId && WM_WINDOWS[drag.wmId] && WM_WINDOWS[drag.wmId].dockable) {
        if (drag.zone.side === "bottom") wmDockBottomWindow(drag.wmId);
        else wmDockSide(drag.wmId, drag.zone.side, drag.zone.mode);
      } else {
        remember(drag.box);
      }
      drag = null;
    }
  };
  document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
  // a sheet opens where you left it (or centered, the first time) when its
  // overlay turns on — a docked sheet skips this, the dock lays it out instead
  if (typeof MutationObserver === "function") new MutationObserver(muts => {
    for (const mu of muts) { const el = mu.target; if (el.classList && el.classList.contains("on") && !el.classList.contains("docked")) { const box = el.classList.contains("overlay") ? el.querySelector(".sheet") : el.id === "importsheet" ? el : null; if (box) restore(box); } }
  }).observe(document.body, {attributes: true, attributeFilter: ["class"], subtree: true});
})();
                             S.wm = wmLoad();
// ⋯ More is gone entirely now (a drop-up, 2026-10-01, then removed outright
// in the chrome density follow-up the same day) — a device that had
// "moresheet" docked or tabbed from before either change would otherwise
// strand a dead id in wm forever (wmLayoutAll has nothing to lay out for
// it; makeWindow() is never called for it either). Purge it once, here,
// before any layout runs — pure (wmRemoveSideTab/wmClearBottom take no
// DOM), so it's safe at module-eval time in the vm harness too.
for (const side of ["left", "right"]) if (S.wm[side] && S.wm[side].ids && S.wm[side].ids.includes("moresheet")) S.wm = wmRemoveSideTab(S.wm, side, "moresheet");
if (S.wm.bottom && S.wm.bottom.ids && S.wm.bottom.ids.includes("moresheet")) S.wm = wmClearBottom(S.wm, "moresheet");
wmSave(S.wm);
try { localStorage.removeItem("ff1roll-sheetpos-moresheet"); } catch (err) { /* private mode */ }  // Applies wm[side] to the DOM: parks EVERY member of the tab group (full or
if (typeof document !== "undefined" && document.body) { // real browser only — dismissing the menu is not unit tested (see comment above)
  document.addEventListener("pointerdown", e => {
    const menu = document.getElementById("wmmenu");
    if (menu.classList.contains("on") && !(e.target.closest && (e.target.closest("#wmmenu") || e.target.closest(".wmdock")))) wmCloseMenu();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") wmCloseMenu(); });
}
// ---- migrate the windows onto the shared window shape (phase A, extended
// footer v2 tweaks 2026-09-30) — asksheet already had a right-only dock;
// the rest are new. infosheet
// (Status, the full-message reader) is registered but NOT dockable (Josh,
// 2026-09-29) — a one-shot reveal for a truncated status line isn't a panel
// worth pinning open while working the roll, same reasoning as the import
// hub below. Settings (#settingssheet, not yet migrated onto makeWindow at
// all) stays non-dockable too.
makeWindow("asksheet", {dockable: true});
makeWindow("notelistsheet", {dockable: true});
makeWindow("instsheet", {dockable: true});
makeWindow("jobssheet", {dockable: true});
makeWindow("pubjobsheet", {dockable: true});
makeWindow("mixersheet", {dockable: true}); // Logic-style: dockable to the bottom
// ⋯ More was briefly the seventh window (footer v2 tweaks, 2026-09-30),
// then a drop-up (2026-10-01), then removed entirely (chrome density
// follow-up, 2026-10-01 pm) — its tools are in View ▾ and the footer now;
// nothing here was ever registered for it.
makeWindow("infosheet", {dockable: false});
// the import hub (docs/import-hub-design.md): a one-shot picker, not a panel
// worth pinning open while working the roll — registered so it's a known
// window (WM_WINDOWS), but not dockable, so it gets no Dock button.
makeWindow("importhub", {dockable: false});
makeWindow("versionssheet", {dockable: false});
wmSideDividerize("wmdivider-left-full", "left");
wmSideDividerize("wmdivider-left-inner", "left");
wmSideDividerize("wmdivider-right-full", "right");
wmSideDividerize("wmdivider-right-inner", "right");
(function wmBottomHeightDividerize() { // along the bottom dock's top edge — drag up (negative clientY delta) grows it
  const divider = document.getElementById("wmdivider-bottomh");
  let drag = null, lastTap = -Infinity; // double-tap resets to the default height
  divider.addEventListener("pointerdown", e => {
    if (e.button && e.button !== 0) return;
    if (!S.wm.bottom) return;
    const now = performance.now();
    if (now - lastTap < 350) {
      lastTap = -Infinity;
      S.wm = wmSetBottomHeight(S.wm, WM_DEFAULT_H, wmInnerHeight());
      wmSave(S.wm);
      wmLayoutAll();
      e.preventDefault();
      return;
    }
    lastTap = now;
    drag = {y0: e.clientY, h0: S.wm.bottom.h, id: e.pointerId};
    divider.classList.add("dragging");
    try { divider.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    e.preventDefault();
  });
  document.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id || !S.wm.bottom) return;
    S.wm = wmSetBottomHeight(S.wm, drag.h0 - (e.clientY - drag.y0), wmInnerHeight());
    wmLayoutAll();
  });
  const end = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    divider.classList.remove("dragging");
    drag = null;
    wmSave(S.wm);
  };
  document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
})();
(function wmBottomSplitDividerize() { // between the bottom dock's two slots, only shown with both occupied
  const divider = document.getElementById("wmdivider-bottomsplit");
  let drag = null;
  divider.addEventListener("pointerdown", e => {
    if (e.button && e.button !== 0) return;
    if (!S.wm.bottom) return;
    const r = document.getElementById("dockbottom").getBoundingClientRect();
    drag = {x0: e.clientX, split0: S.wm.bottom.split != null ? S.wm.bottom.split : 0.5, width: r.width || wmInnerWidth(), id: e.pointerId};
    divider.classList.add("dragging");
    try { divider.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    e.preventDefault();
  });
  document.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id || !S.wm.bottom) return;
    S.wm = wmSetBottomSplit(S.wm, drag.split0 + (e.clientX - drag.x0) / Math.max(1, drag.width));
    wmLayoutAll();
  });
  const end = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    divider.classList.remove("dragging");
    drag = null;
    wmSave(S.wm);
  };
  document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
})();
// growing/shrinking the window re-checks wmAllowed() live: crossing below
// phone width mid-session floats every docked window (the pref itself is
// untouched — growing back re-offers and reapplies it)
window.addEventListener("resize", wmLayoutAll);
document.getElementById("askbtn").addEventListener("click", askBtnTap);
for (const [id, mode] of [["askmodesong", "song"], ["askmodegen", "general"], ["askmodeterm", "terminal"]]) document.getElementById(id).addEventListener("click", () => {
  if ((S.askTerminal ? "terminal" : S.askGeneral ? "general" : "song") === mode) return;
  askSetMode(mode);
  askRender(); askRefresh(); askSessionRefresh();
});
document.getElementById("asknowstrip").addEventListener("click", askStatusToggle);
document.getElementById("askreplybtn").addEventListener("click", openAsk);
document.getElementById("askgear").addEventListener("click", () => { asksheet.classList.remove("on"); openSettingsSheet(); });
document.getElementById("askclear").addEventListener("click", async () => { // Clear = new session; unsaved messages are the one thing it can destroy
  const n = askUnsavedCount();
  if (n && !(await appConfirm("Clear chat", n + " message" + (n === 1 ? " is" : "s are") + " not in the repo yet — Save the song first to keep " + (n === 1 ? "it" : "them") + ". Clear anyway?", "Clear", "Keep"))) return;
  localStorage.removeItem(askStoreKey()); askSentReset(askStoreKey()); askRender(); updateSongBtn();
  // Clear really resets (open-items.md "NEXT: AI SESSION CONTROLS" #1, Josh:
  // "the app's Clear chat only clears this device's log and never tells the
  // bridge, so the same Claude session keeps being resumed and growing"):
  // drop the bridge's session id too, when the backend is the bridge —
  // best-effort, never blocks the local clear above
  if (S.askCaps.bridge && S.askCaps.sessions && !S.askTerminal) {
    const key = askSessionName();
    delete S.askSessionCache[key];
    try { await fetch(aiUrl() + "/v1/sessions/" + encodeURIComponent(key), {method: "DELETE", headers: aiHeaders()}); } catch (err) { /* the local clear already happened; the bridge just keeps resuming the old one */ }
    askSessionRender();
  }
});
document.getElementById("asksend").addEventListener("click", askSend);
document.getElementById("askstop").addEventListener("click", () => { if (S.askBusy) S.askBusy.abort(); });
askinput.addEventListener("input", askGrow);
askinput.addEventListener("blur", () => { if (!(typeof S.micBtn !== "undefined" && S.micBtn === document.getElementById("askmic"))) askComposing(false); }); // the draft is saved; a build may go ahead
document.getElementById("askmic").addEventListener("click", () => {
  if (!SPEECH) { askstatus.textContent = "no speech recognition in this browser — the keyboard mic still works"; return; }
  micToggle(document.getElementById("askmic"), askinput, s2 => { askstatus.textContent = s2; });
});
askinput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askSend(); }
});

 
 

   function renderFolderUI() {
  const nameEl = document.getElementById("foldername");
  const pick = document.getElementById("folderpick");
  const forget = document.getElementById("folderforget");
  const recon = document.getElementById("filefolder");
  const native = !!nativeFs();
  document.getElementById("filesrow").style.display = native ? "" : "none";
  document.getElementById("folderrow").style.display = native ? "none" : "";
  if (native) { // the iPad app: nothing to set — Files is where saves live, GitHub is where Publish goes
    document.getElementById("fileshelp").textContent = "Your songs are kept in Files → On My iPad → Night Roll: every Save writes a copy there. Publish sends them to GitHub.";
  } else if (!folderSupported() && fsRoot.mode !== "opfs") {
    // Chrome hides the API on plain http (except localhost/127.0.0.1) — say
    // which of the two it is, or a LAN-served dev copy reads as "wrong browser"
    const insecure = typeof window !== "undefined" && window.isSecureContext === false;
    const brave = typeof navigator !== "undefined" && !!navigator.brave; // Brave ships the API switched OFF (Josh hit this, 2026-09-15)
    nameEl.textContent = insecure
      ? "needs https (or localhost) — this page is plain http, so Chrome hides the folder door; saves go to GitHub here"
      : brave ? "Brave turns this off: open brave://flags/#file-system-access-api, enable, relaunch — or use Chrome"
      : "needs Chrome or Edge on a computer — saves go to GitHub here";
    pick.style.display = "none";
    forget.style.display = "none";
  } else if (fsRoot.handle) {
    nameEl.textContent = (fsRoot.needsGrant ? "⚠ reconnect: " : "📁 ") + fsRoot.name +
      (fsRoot.needsGrant ? " (Chrome needs a fresh OK)" : " — every Publish writes here, nothing goes to GitHub");
    pick.textContent = fsRoot.needsGrant ? "Reconnect" : "Change folder…";
    pick.style.display = "";
    forget.style.display = fsRoot.mode === "opfs" ? "none" : "";
  } else {
    nameEl.textContent = "not set — saves go to GitHub";
    pick.textContent = "Choose folder…";
    pick.style.display = "";
    forget.style.display = "none";
  }
  recon.style.display = fsRoot.handle && fsRoot.needsGrant ? "" : "none";
  document.getElementById("folderonlyrow").style.display = folderActive() ? "" : "none";
  document.getElementById("folderonly").checked = localStorage.getItem("ff1roll-folderonly") === "1";
  document.getElementById("filesave").textContent = folderActive() ? "Publish to folder…" : "Publish…";
  updateSyncBtn();
  updateSongBtn();
}
async function folderAfterChange(msg) { // the catalog and the open song both depend on where data lives
  renderFolderUI();
  albumMetaCache && Object.keys(albumMetaCache).forEach(k => delete albumMetaCache[k]);
  try { await initCatalog(); } catch (err) { /* offline: the folder alone still lists */ }
  if (S.currentPath) { const k = S.currentPath; S.songKey = null; await loadSong(k).catch(() => {}); }
  setInfo(msg);
}
async function chooseFolder() { // must run inside a user gesture
  if (fsRoot.handle && fsRoot.needsGrant) { // reconnect: same folder, fresh permission
    if (await folderPermission(true) === "granted") { fsRoot.needsGrant = false; await folderAfterChange("folder reconnected: " + fsRoot.name); }
    else setInfo("Chrome didn't grant the folder — choose it again");
    return;
  }
  if (!folderSupported()) return;
  let h;
  try { h = await window.showDirectoryPicker({mode: "readwrite", id: "nightroll"}); }
  catch (err) { return; } // cancelled
  fsRoot.handle = h; fsRoot.name = h.name; fsRoot.mode = "picker"; fsRoot.needsGrant = false;
  await idbFsPut(h);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  await folderAfterChange("saving to folder: " + h.name);
}
async function forgetFolder() {
  fsRoot.handle = null; fsRoot.name = ""; fsRoot.mode = null; fsRoot.needsGrant = false;
  await idbFsPut(null);
  await folderAfterChange("folder forgotten — saves go to GitHub again");
}
         document.getElementById("syncbtn").addEventListener("click", openSyncSheet);
for (const p of CFG_PANES) document.getElementById("cfgtab-" + p).addEventListener("click", () => cfgShowPane(p));
function applyTextSize(v) { try { document.documentElement.style.setProperty("--userscale", v); } catch (err) {} }
function settingsPersist(id) {
  const v = el => document.getElementById(el).value.trim();
  const keep = (k, val) => { if (val) localStorage.setItem(k, val); else localStorage.removeItem(k); };
  switch (id) {
    case "ghtoken": keep("ff1roll-ghtoken", v("ghtoken")); ghCheckOut(""); updateSyncBtn(); updateSongBtn(); break; // connecting/disconnecting GitHub changes whether the footer Publish button and ● show (Model B)
    case "cfglearning": setAppMode(document.getElementById("cfglearning").checked ? "learning" : "normal"); applyMode(); break;
    case "cfgnotetapcursor": { try { localStorage.setItem("ff1roll-notetapcursor", document.getElementById("cfgnotetapcursor").checked ? "1" : "0"); } catch (err) { /* private mode */ } break; }
    case "cfgpeninstant": { try { localStorage.setItem("ff1roll-peninstant", document.getElementById("cfgpeninstant").checked ? "1" : "0"); } catch (err) { /* private mode */ } break; }
    case "cfgrecsnap": { try { localStorage.setItem("ff1roll-recsnap", document.getElementById("cfgrecsnap").checked ? "1" : "0"); } catch (err) { /* private mode */ } break; }
    case "cfgtextsize": { const tv = v("cfgtextsize") || "1"; try { localStorage.setItem("ff1roll-textsize", tv); } catch (err) { /* private mode */ } applyTextSize(tv); break; }
    case "cfgdebuglog": { try { if (document.getElementById("cfgdebuglog").checked) localStorage.setItem("ff1roll-debuglog", "1"); else localStorage.removeItem("ff1roll-debuglog"); } catch (err) { /* private mode: stays off */ } errChip(); break; }
    case "cfgchipstream": { const sv = v("cfgchipstream") || "auto"; try { localStorage.setItem("ff1roll-chipstream", sv); } catch (err) { /* private mode: stays the default */ } break; }
    case "cfgaikey": keep("ff1roll-aikey", v("cfgaikey")); S.askModelCache = null; break;
    case "cfgaibackend": saveCfg({aiBackend: v("cfgaibackend") === "browser" ? "browser" : "remote"}); aiBackendRows(); break;
    case "cfgaibrowsermodel": saveCfg({aiBrowserModel: v("cfgaibrowsermodel") || "Llama-3.2-1B-Instruct-q4f16_1-MLC"}); break;
    case "cfgaiurl": {
      const url = (v("cfgaiurl") || "http://localhost:1234").replace(/\/+$/, "");
      if (url !== cfg().aiUrl) { saveCfg({aiUrl: url}); S.askModelCache = null; aiModelMenu([], cfg().aiModel); }
      break;
    }
    case "cfgaimodel": saveCfg({aiModel: v("cfgaimodel")}); break;
    case "cfgaiwindow": saveCfg({aiWindow: parseInt(v("cfgaiwindow"), 10) || 8192}); break;

    case "cfgsongsrepo": { // annotations follow unless the advanced row split them on purpose
      const c = cfg(), repo = v("cfgsongsrepo") || "Night-Roll-App/night-roll", patch = {songsRepo: repo};
      if (c.analysisRepo === c.songsRepo) patch.analysisRepo = repo;
      // saveCfg stores every default with the first saved setting, so a new
      // user's cfg carried Josh's archive; switching to their own songs repo
      // then published their game files to a repo their token can't write
      // (Josh, 2026-09-28: "it's going to try to push to my NSF repo?")
      if (repo !== "Night-Roll-App/night-roll" && c.nsfRepo === "Night-Roll-App/nsf-archive") { patch.nsfRepo = ""; patch.nsfBase = ""; document.getElementById("cfgnsfrepo").value = ""; }
      saveCfg(patch); ghCheckOut(""); break;
    }
    case "cfgnsfrepo": { const r = v("cfgnsfrepo"); saveCfg({nsfRepo: r, nsfBase: r ? "https://raw.githubusercontent.com/" + r + "/main" : ""}); cfg.c = null; break; }
    default: return; // folderonly has its own listener
  }
  if (id.startsWith("cfgai")) askRefresh();
}
document.getElementById("settingssheet").addEventListener("change", e => { if (e.target && e.target.id) settingsPersist(e.target.id); });
document.getElementById("ghcheck").addEventListener("click", ghCheck);
document.getElementById("filesettings").addEventListener("click", () => {
  closeFileMenus();
  openSettingsSheet();
});
document.getElementById("folderpick").addEventListener("click", () => { chooseFolder(); });
document.getElementById("folderforget").addEventListener("click", () => { forgetFolder(); });
document.getElementById("folderonly").addEventListener("change", e => {
  if (e.target.checked) localStorage.setItem("ff1roll-folderonly", "1"); else localStorage.removeItem("ff1roll-folderonly");
  folderAfterChange(e.target.checked ? "the song list is now your folder only" : "the song list shows the site's albums again");
});
document.getElementById("filefolder").addEventListener("click", () => { closeFileMenus(); chooseFolder(); });
// Every sheet closes three ways (Josh, 2026-08-25: "I have a lot of problems
// with our modals" — opening the notes list by mistake meant scrolling to the
// bottom to find Close). Tap the backdrop, press Esc, or hit a ✕ that stays
// pinned at the top while the body scrolls. confirmsheet is exempt: it asks a
// question and has to get an answer.
const MODAL_KEEP = new Set(["confirmsheet"]);
if (typeof document.querySelectorAll === "function") { // vm harness stubs document
// A sheet keeps the scroll position it had when it was last closed, so
// reopening the notes list dropped Josh halfway down it (2026-08-25). Reset on
// open wherever the open happens — watching the class beats hunting ~30 call
// sites and cannot miss a future one. Scoped to the overlays themselves, NOT
// document.body: an app that repaints at 60fps must not run an observer over
// every class write in the tree. Overlay classes change only when a sheet
// opens or closes.
const SHEET_TOP = new MutationObserver(ms => {
  for (const m of ms) {
    // VoiceOver (2026-09-30): a docked window sits beside the roll like a
    // panel, not over it — aria-modal="true" would tell a screen reader
    // everything else on the page is inert, which is false while docked.
    // Recomputed on every class write (open/close AND dock-side changes all
    // touch the class), so it never goes stale.
    m.target.setAttribute("aria-modal", m.target.classList.contains("on") && !m.target.classList.contains("docked") ? "true" : "false");
    // any migrated, docked window: reserve/free its dock's space alongside
    // its own visibility, however it closes (✕, backdrop, Esc, or
    // reopening) — the one choke point every close path already runs through
    if (WM_WINDOWS[m.target.id]) wmLayoutAll();
    if (!m.target.classList.contains("on")) { // closing: a live 🎤 inside must not keep transcribing
      if (S.micBtn && m.target.contains(S.micBtn)) micStop(true);
      if (m.target.id === "mixersheet") teardownMixerMeters(); // ✕/backdrop/Esc all end here too — no cost while closed
      // VoiceOver: give focus back to whatever opened this sheet (a button
      // in most cases) — otherwise focus is left on a now-hidden node and a
      // screen reader user loses their place. Deferred repeat closes (the
      // Escape handler below, or a second class write before this one even
      // ran) leave nothing to restore — harmless no-op.
      if (m.target._srReturnFocus) {
        const back = m.target._srReturnFocus;
        m.target._srReturnFocus = null;
        if (typeof back.focus === "function") try { back.focus(); } catch (err) {}
      }
      continue;
    }
    // only a sheet that has just OPENED starts at its top: docking, undocking
    // and switching sides rewrite the class too, and reset the AI chat to its
    // first message every time (Josh, 2026-09-29, the docked AI panel)
    if (/(^|\s)on(\s|$)/.test(m.oldValue || "")) continue;
    if (m.target.id === "mixersheet") { // opened some other way than openMixer() (e.g. a docked tab click): render + start meters
      renderMixer();
      ensureMixerMeters();
      ensureMixerMeterLoop();
    }
    const sh = m.target.querySelector(".sheet");
    if (sh) sh.scrollTop = 0;
    // VoiceOver: remember who had focus, then move focus INTO the sheet —
    // deferred one frame so a sheet's own open-time focus (e.g. rename's
    // text input, already existing code) wins if it set one; only step in
    // when nothing in the sheet already has focus.
    m.target._srReturnFocus = (typeof document !== "undefined" && document.activeElement && document.activeElement !== document.body) ? document.activeElement : null;
    const target = m.target;
    requestAnimationFrame(() => {
      if (!target.classList.contains("on")) return; // closed again before the frame landed
      if (document.activeElement && document.activeElement !== document.body && target.contains(document.activeElement)) return; // the sheet already focused itself
      // the SHEET itself, never a field inside it: focusing a text box pops
      // the iPad keyboard every time a sheet opens (Josh already fought an
      // unwanted keyboard in ✦ AI); VoiceOver still announces the dialog
      const sh2 = target.querySelector(".sheet");
      const land = sh2 || target;
      if (land && !land.hasAttribute("tabindex")) land.setAttribute("tabindex", "-1");
      if (land && typeof land.focus === "function") try { land.focus({preventScroll: true}); } catch (err) {}
    });
  }
});
for (const ov of document.querySelectorAll(".overlay")) {
  SHEET_TOP.observe(ov, {attributes: true, attributeFilter: ["class"], attributeOldValue: true}); // incl. confirm
  // VoiceOver: every overlay is a dialog (confirmsheet included — it's the
  // one MODAL_KEEP exempts from backdrop/Esc dismissal, not from being a
  // dialog), labelled by its own heading so a screen reader announces WHICH
  // sheet just opened instead of a bare "dialog". aria-modal is kept live by
  // the observer above (docked vs. floating can change after open).
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  const sh0 = ov.querySelector(".sheet");
  if (sh0) {
    if (!(sh0.tabIndex >= 0)) sh0.tabIndex = -1; // a focus target with nothing else inside, never in the Tab order itself
    const h = sh0.querySelector("h2, h3");
    if (h) {
      if (!h.id) h.id = ov.id + "-srlabel";
      ov.setAttribute("aria-labelledby", h.id);
    }
  }
  if (MODAL_KEEP.has(ov.id)) continue;
  // pointerdown, and only when the backdrop ITSELF is the target — a drag that
  // starts inside the sheet and releases outside must not count as a dismiss
  ov.addEventListener("pointerdown", e => { if (e.target === ov) ov.classList.remove("on"); });
  const sh = ov.querySelector(".sheet");
  if (!sh || sh.querySelector(".sheetx")) continue;
  const x = document.createElement("button");
  x.className = "sheetx";
  x.textContent = "✕";
  x.setAttribute("aria-label", "Close");
  x.addEventListener("click", () => wmCloseWindow(ov));
  sh.prepend(x);
}
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const open = [...document.querySelectorAll(".overlay.on")].filter(o => !MODAL_KEEP.has(o.id));
  if (!open.length) return;
  open[open.length - 1].classList.remove("on"); // topmost only, so Esc unstacks
  e.preventDefault();
});
}
 document.getElementById("sharelink").addEventListener("click", async () => {
  const st = document.getElementById("syncstatus");
  if (!S.songKey || !/^albums\//.test(S.songKey)) { st.textContent = "Local files have no link — publish the song first."; return; }
  const link = shareLinkFor(S.songKey);
  try {
    if (navigator.share) { await navigator.share({title: songTitleOf(S.songKey) + " · Night Roll", url: link}); st.textContent = "Shared."; return; }
    await navigator.clipboard.writeText(link);
    st.textContent = "Link copied: " + link;
  } catch (err) { st.textContent = err && err.name === "AbortError" ? "" : "Couldn't share: " + err.message + " — " + link; }
});
document.getElementById("fileshare").addEventListener("click", () => { closeFileMenus(); openShareSheet(); });
document.getElementById("shClose").addEventListener("click", () => document.getElementById("sharesheet").classList.remove("on"));
document.getElementById("shUrl").addEventListener("focus", e => e.target.select());
document.getElementById("shCopy").addEventListener("click", async e => {
  try { await navigator.clipboard.writeText(document.getElementById("shUrl").value); e.target.textContent = "Copied ✓"; }
  catch (err) { document.getElementById("shUrl").select(); e.target.textContent = "Select + copy"; }
  setTimeout(() => { e.target.textContent = "Copy"; }, 1500);
});
document.getElementById("shSend").addEventListener("click", async () => {
  try { await navigator.share({title: songTitleOf(S.songKey) + " · Night Roll", url: document.getElementById("shUrl").value}); }
  catch (err) { /* AbortError = he closed the share sheet */ }
});
document.getElementById("copyfile").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(serializeRollnotes());
    document.getElementById("syncstatus").textContent = "Copied to clipboard.";
  } catch (err) { document.getElementById("syncstatus").textContent = "Copy failed: " + err.message; }
});
document.getElementById("dlfile").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([serializeRollnotes()], {type: "text/plain"}));
  a.download = baseName() + ".rollnotes.json";
  a.click();
  URL.revokeObjectURL(a.href);
});
document.getElementById("ghsave").addEventListener("click", async e => {
  const btn = e.currentTarget;
  const status = document.getElementById("syncstatus");
  if (S.song && isUnsaved(S.songKey)) { // no folder yet (lotion, 2026-10-03): name it first — same sheet Save Version uses — then ship, instead of silently publishing annotations only
    const token = takeToken(status);
    if (!token) return;
    syncsheet.classList.remove("on");
    openSaveForm("publish");
    return;
  }
  if (S.song && isComposition()) { // writing mode: the ONE button ships everything, via the one publish function
    btn.disabled = true;
    status.textContent = "Publishing " + S.songKey + " (.mid + annotations)…";
    try {
      const token = writeToken();
      if (!token) { status.textContent = "No GitHub token stored yet — add one in File → Settings."; return; }
      status.textContent = await publishOpenComposition(ghHeaders(token), m => status.textContent = m);
    } catch (err) { status.textContent = "Publish failed: " + err.message; }
    finally { btn.disabled = false; }
    return;
  }
  const token = takeToken(status);
  if (!token) return;
  if (!S.songKey) { status.textContent = "Local file — no repo path. Use Copy/Download."; return; }
  btn.disabled = true;
  status.textContent = "Publishing…";
  try {
    await publishSong(S.songKey, ghHeaders(token), m => status.textContent = m); // annotations only: publishSong's own hisMusic check skips the .mid
    status.textContent = folderActive() ? "Published ✓ to " + fsRoot.name + "."
                                        : "Published ✓ (GitHub Pages takes ~1 min to serve the new file.)";
    setTimeout(() => { // done — close, and return to the notes list if that's where we came from
      syncsheet.classList.remove("on");
      if (S.syncReturnToList) { renderNoteList(); notelistSheet.classList.add("on"); }
    }, 900);
  } catch (err) { status.textContent = "Publish failed: " + err.message; }
  finally { btn.disabled = false; }
});
JOB_KINDS.publishall = {
  label: j => j.title,
  open: j => openPubJobSheet(j),
  retry: j => { const job = publishAllJobStart(setInfo); if (job) openPubJobSheet(job); },
};
document.getElementById("ghsaveall").addEventListener("click", () => {
  const status = document.getElementById("syncstatus");
  const token = takeToken(status);
  if (!token) return;
  const job = publishAllJobStart(s => { status.textContent = s; });
  if (!job) return;
  document.getElementById("syncsheet").classList.remove("on");
  openPubJobSheet(job);
});

if (typeof document !== "undefined" && document.body && document.body.dataset) document.body.dataset.edition = EDITION; // the vm harness has no body
applyViewMode();
resize();
updateSyncBtn();
// ---- service worker (Phase 0, 2026-09-26): offline launch from the Home
// Screen; network-first for the page itself so a stale index.html can never
// stick. ?sw=0 is the kill switch: unregister + drop the caches, for a device
// that misbehaves. Secure contexts only (Pages is https; localhost counts).
if (typeof navigator !== "undefined" && navigator.serviceWorker && typeof location !== "undefined" && S.APP_BASE) {
  if (PERF_FLAGS.get("sw") === "0") {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    if (typeof caches !== "undefined") caches.keys().then(ks => ks.forEach(k => { if (k.startsWith("night-roll-")) caches.delete(k); })).catch(() => {});
    setInfo("offline support turned off on this device — reload without ?sw=0 to turn it back on");
  } else {
    navigator.serviceWorker.register(new URL("sw.js", S.APP_BASE).href, {scope: S.APP_BASE})
      .then(reg => { const w = reg.active || reg.waiting || reg.installing; if (w && navigator.onLine !== false) w.postMessage("warm"); }) // every catalog song into the cache, in the background
      .catch(err => console.warn("sw:", err.message));
  }
}
try { // a job still "running" in the mirror = the page died mid-way; the row keeps its last counts (this replaced the sessionStorage capture beacon, 2026-09-27)
  const j = jobsLoad();
  if (j) {
    const msg = "⚠ interrupted: " + j.title + " " + jobProgress(j) + " — tap ⏳ to see or retry";
    setInfo(msg);
    setTimeout(() => setInfo(msg), 2500); // outlive whatever boot writes over it
  }
} catch (err) { /* no mirror */ }
(async function boot() {
  // boot watchdog (docs/split-plan.md §4 step 0b): the inline classic
  // script in index.html's <head> arms a 10s failsafe before any module
  // runs, for a module 404/syntax error that would otherwise leave a blank
  // screen. Reaching here proves the module graph loaded and boot() is
  // running, so the dangerous window has passed — clear it now, not at the
  // end of boot(), so a slow catalog fetch can never trip a false alarm.
  if (typeof window !== "undefined" && window.__nrBoot) { clearTimeout(window.__nrBoot); window.__nrBoot = null; }
  await restoreFolder(); // where data lives decides what the catalog holds
  renderFolderUI();
  try { await initCatalog(); }
  catch (e) {
    const b = cfg().songsBase || "(this site)";
    setInfo("catalog failed to load from " + b + " — check File → Settings, or serve over http: " + e.message);
    return;
  }
  const all = Object.values(S.CATALOG).flat().map(([, p]) => p);
  const qsong = typeof location !== "undefined" ? songPathFromURL(location.href) : null; // shared link wins — ?song= (old) or the path form
  const last = localStorage.getItem("ff1roll-lastsong");
  // drafts aren't in the manifest but are perfectly loadable (draft-wins path)
  const loadable = p => all.includes(p) || (p && localStorage.getItem("ff1roll-draft-" + p));
  if (folderOnly() && !qsong && !loadable(last)) { // his list, not Overworld: first of his songs, or a fresh one
    if (all.length) S.currentPath = all[0];
    else {
      setInfo("your folder has no songs yet — name one below and it lands there");
      document.getElementById("filenewform").style.display = "";
      document.getElementById("filesheet").classList.add("on");
      return;
    }
  } else S.currentPath = qsong ? qsong
    : loadable(last) ? last : homeSong(all);
  // album links (2026-09-29): a shared link can arm an album too (armAlbumLink)
  armAlbumLink(typeof location !== "undefined" ? albumParamFromURL(location.href) : null, S.currentPath);
  updateSongBtn();
  reflectSongURL(S.currentPath); // the address bar is the share link from the first frame: path form, never ?song=
  // a dead link (moved/renamed song in ?song= or a stale last-song) must not
  // strand you on a blank page: warn, then fall back to something that exists
  const bootFallback = why => {
    const fb = loadable(last) && last !== S.currentPath ? last : homeSong(all);
    setInfo("⚠ " + why + " — opening " + fb.split("/").pop() + " instead (the song may have moved: use Open…)");
    S.currentPath = fb;
    updateSongBtn();
    reflectSongURL(fb);
    return loadSong(fb);
  };
  const first = (qsong && !loadable(S.currentPath))
    ? bootFallback("that link's song isn't in the catalog: " + S.currentPath)
        .catch(e => setInfo("load failed — open via a web server (GitHub Pages): " + e.message))
    : loadSong(S.currentPath).catch(e => {
        if (/fetch failed/.test(e.message)) return bootFallback("couldn't load " + S.currentPath).catch(() => setInfo("load failed: " + e.message));
        setInfo("load failed — open via a web server (GitHub Pages): " + e.message);
      });
  first.finally(nativeOpenHook); // a file handed to the iPad app at launch opens over the first song, not under it
})();



// ---- e2e accessor mirror (docs/split-plan.md §4 step 0b deviation) -------
// Generated by tools/split/cutover.mjs (step 0b) / tools/split/
// regen-e2e-footer.mjs (step 1 on), not hand-maintained — re-running either
// regenerates this block from app.js's CURRENT top-level names, so it never
// drifts. app.js is the legacy container: as module-split steps carve real
// modules out of it, its remaining top-level names shrink (step 1's
// promote-state.mjs moved ~257 of them to `S`; later steps move functions
// to their own modules, where a real `export` replaces this mirror for
// them), so without regenerating this block after a change, src/devtools.js's
// window mirror would offer a stale accessor referencing a name no longer
// declared here — a free-identifier violation tools/split/check.mjs's rule 1
// catches statically, and a ReferenceError at runtime if it weren't. get
// covers every top-level name; set covers the mutable ones (function/class
// declarations and non-const variables — ES modules allow reassigning those,
// same as `let`). Identical technique to tests/harness.mjs's own per-module
// footer (§3.2), which already solves this for the vm test harness — but a
// DIFFERENT name (__nrExpose$, not __nr$): tests/harness.mjs's module-mode
// loader blindly appends its OWN __nr$ footer to every src/ file it loads
// (including app.js, as a test fixture), so reusing that name here would
// double-declare it the moment a vm test loads this file. tools/split/
// check.mjs's rule 1 treats every name referenced here as already bound
// (they're this module's own top-level declarations), so this block does
// not introduce free-identifier findings.
export const __nrExpose$ = {get: {"HOLD_MS": () => HOLD_MS, "HOLD_SLOP": () => HOLD_SLOP, "RULER_RANGE_SLOP": () => RULER_RANGE_SLOP, "homeSong": () => homeSong, "openInsertBars": () => openInsertBars, "openDeleteBars": () => openDeleteBars, "fileMeterAt": () => fileMeterAt, "refreshKeyPreview": () => refreshKeyPreview, "dedupeSong": () => dedupeSong, "insertChordAt": () => insertChordAt, "insertProgressionAt": () => insertProgressionAt, "openVersionsSheet": () => openVersionsSheet, "goBackToVersion": () => goBackToVersion, "renderVersionsSheet": () => renderVersionsSheet, "goBackToPublished": () => goBackToPublished, "openGridSheet": () => openGridSheet, "recordRealtimeAudio": () => recordRealtimeAudio, "DP_PIECES": () => DP_PIECES, "dpSteps": () => dpSteps, "dpDefault": () => dpDefault, "dpRender": () => dpRender, "dpBuildBeatSelects": () => dpBuildBeatSelects, "segGet": () => segGet, "openPasteTo": () => openPasteTo, "renderFolderUI": () => renderFolderUI, "folderAfterChange": () => folderAfterChange, "chooseFolder": () => chooseFolder, "forgetFolder": () => forgetFolder, "applyTextSize": () => applyTextSize, "settingsPersist": () => settingsPersist, "MODAL_KEEP": () => MODAL_KEEP}, set: {"homeSong": (v) => (homeSong = v), "openInsertBars": (v) => (openInsertBars = v), "openDeleteBars": (v) => (openDeleteBars = v), "fileMeterAt": (v) => (fileMeterAt = v), "refreshKeyPreview": (v) => (refreshKeyPreview = v), "dedupeSong": (v) => (dedupeSong = v), "insertChordAt": (v) => (insertChordAt = v), "insertProgressionAt": (v) => (insertProgressionAt = v), "openVersionsSheet": (v) => (openVersionsSheet = v), "goBackToVersion": (v) => (goBackToVersion = v), "renderVersionsSheet": (v) => (renderVersionsSheet = v), "goBackToPublished": (v) => (goBackToPublished = v), "openGridSheet": (v) => (openGridSheet = v), "recordRealtimeAudio": (v) => (recordRealtimeAudio = v), "dpSteps": (v) => (dpSteps = v), "dpDefault": (v) => (dpDefault = v), "dpRender": (v) => (dpRender = v), "dpBuildBeatSelects": (v) => (dpBuildBeatSelects = v), "segGet": (v) => (segGet = v), "openPasteTo": (v) => (openPasteTo = v), "renderFolderUI": (v) => (renderFolderUI = v), "folderAfterChange": (v) => (folderAfterChange = v), "chooseFolder": (v) => (chooseFolder = v), "forgetFolder": (v) => (forgetFolder = v), "applyTextSize": (v) => (applyTextSize = v), "settingsPersist": (v) => (settingsPersist = v)}};

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
import { CHORD_QUALS } from "./theory/chords.js";
import { stampChordBand } from "./model/rollnotes.js";
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
import { openGridSheet } from "./ui/sheets.js";
import { openPasteTo } from "./ui/sheets.js";
import { openInsertBars } from "./ui/sheets.js";
import { openDeleteBars } from "./ui/sheets.js";
import { openVersionsSheet } from "./ui/sheets.js";
import { dpRender } from "./ui/sheets.js";
import { dpBuildBeatSelects } from "./ui/sheets.js";
import { DP_PIECES } from "./ui/sheets.js";
import { segGet } from "./ui/sheets.js";
import { settingsPersist } from "./ui/sheets.js";
import { chooseFolder } from "./ui/sheets.js";
import { forgetFolder } from "./ui/sheets.js";
import { folderAfterChange } from "./ui/sheets.js";
import { renderFolderUI } from "./ui/sheets.js";
import { goBackToVersion } from "./ui/sheets.js";
import { renderVersionsSheet } from "./ui/sheets.js";
import { goBackToPublished } from "./ui/sheets.js";
import { dpSteps } from "./ui/sheets.js";
import { dpDefault } from "./ui/sheets.js";
import { applyTextSize } from "./ui/sheets.js";
import { insertChordAt } from "./model/selection.js";
import { insertProgressionAt } from "./model/selection.js";
import { dedupeSong } from "./model/selection.js";
import { HOLD_MS } from "./input/gestures.js";
import { HOLD_SLOP } from "./input/gestures.js";
import { RULER_RANGE_SLOP } from "./input/gestures.js";
import { recordRealtimeAudio } from "./audio/bounce.js";
import { MODAL_KEEP } from "./ui/wm.js";
import { refreshKeyPreview } from "./ui/notes.js";
import { fileMeterAt } from "./ui/notes.js";
import { homeSong } from "./session/boot.js";
import { initChrome2 } from "./ui/chrome.js";
import { initChrome3 } from "./ui/chrome.js";
import { initChrome4 } from "./ui/chrome.js";
import { initChrome5 } from "./ui/chrome.js";
import { initChrome6 } from "./ui/chrome.js";
import { initChrome7 } from "./ui/chrome.js";
import { initChrome8 } from "./ui/chrome.js";
import { initChrome9 } from "./ui/chrome.js";
import { initChrome10 } from "./ui/chrome.js";
import { initChrome11 } from "./ui/chrome.js";
import { initChrome12 } from "./ui/chrome.js";
import { initChrome13 } from "./ui/chrome.js";
import { initChrome14 } from "./ui/chrome.js";
import { initChrome15 } from "./ui/chrome.js";
import { initChrome16 } from "./ui/chrome.js";
import { initSheets1 } from "./ui/sheets.js";
import { initSheets2 } from "./ui/sheets.js";
import { initSheets3 } from "./ui/sheets.js";
import { initSheets4 } from "./ui/sheets.js";
import { initSheets5 } from "./ui/sheets.js";
import { initSheets6 } from "./ui/sheets.js";
import { initSheets7 } from "./ui/sheets.js";
import { initSheets8 } from "./ui/sheets.js";
import { initSheets9 } from "./ui/sheets.js";
import { initNoteEditor1 } from "./ui/note-editor.js";
import { initNoteEditor2 } from "./ui/note-editor.js";
import { initNoteEditor3 } from "./ui/note-editor.js";
import { initNoteEditor4 } from "./ui/note-editor.js";
import { initNoteEditor5 } from "./ui/note-editor.js";
import { initNoteEditor6 } from "./ui/note-editor.js";
import { initNotes1 } from "./ui/notes.js";
import { initNotes2 } from "./ui/notes.js";
import { initNotes3 } from "./ui/notes.js";
import { initTrackbar1 } from "./ui/trackbar.js";
import { initVoiceMenu1 } from "./ui/voice-menu.js";
import { initWm1 } from "./ui/wm.js";
import { initWm2 } from "./ui/wm.js";
import { initGestures1 } from "./input/gestures.js";
import { initGestures2 } from "./input/gestures.js";
import { initRecord1 } from "./input/record.js";
import { initKeyboard1 } from "./input/keyboard.js";
import { initKeyboard2 } from "./input/keyboard.js";
import { initHub1 } from "./import/hub.js";
import { initCapture1 } from "./import/capture.js";
import { initPublish1 } from "./sync/publish.js";
import { initPublish2 } from "./sync/publish.js";
import { initPublish3 } from "./sync/publish.js";
import { initBackend1 } from "./ask/backend.js";
import { initSheet1 } from "./ask/sheet.js";
import { initSheet2 } from "./ask/sheet.js";
import { initSheet3 } from "./ask/sheet.js";
import { initBridge1 } from "./ask/bridge.js";
import { initBridge2 } from "./ask/bridge.js";
import { initEngine1 } from "./audio/engine.js";
import { initEngine2 } from "./audio/engine.js";
import { initTransport1 } from "./audio/transport.js";
import { initAlbum1 } from "./session/album.js";
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
 initChrome2();

 
initTrackbar1();
 
 
 initNoteEditor1();
  
    initSheets1();
             initChrome3();
 
  initGestures1();

 

 initEngine1();
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
initEngine2();
           initChrome4();
initVoiceMenu1();
                         
                        
        initTransport1();
  initAlbum1();


  initChrome5();
                         






 initChrome1();
initChrome6();

 initNotes1();
 
initSheets2();

                    initGestures2();

initNotes2();


initChrome7();

initNotes3();

initChrome8();


  
initNoteEditor2();
 initHub1();
 initNoteEditor3();
initChrome9();
  initRecord1();
initKeyboard1();
initSheets3();
initChrome10();
initKeyboard2();

initNoteEditor4();


  
 
     initPublish1();
initSheets4();
initChrome11();
 initPublish2();
  initChrome12();
    initCapture1();
 initChrome13();
initNoteEditor5();
initSheets5();

 initNoteEditor6();
 initChrome14();

 

         initBackend1();


   initSheet1();
  
      initChrome15();


initBridge1();
    initSheet2();
  initBridge2();
initWm1();
                             initSheet3();

 
 

            initSheets6();
initWm2();
 initSheets7();
initPublish3();
initSheets8();

initChrome16();
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
initSheets9();
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



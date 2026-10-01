/** PipeWire node that Kenku plays into; shown to Chromium as an output device labelled with its description */
export const VIRTUAL_MIC_SINK_NAME = "kenku_fm_output";
export const VIRTUAL_MIC_SINK_LABEL = "Kenku FM Output";

/** PipeWire node other apps select as their microphone */
export const VIRTUAL_MIC_SOURCE_NAME = "kenku_fm";
export const VIRTUAL_MIC_SOURCE_LABEL = "Kenku FM";

/** Input device labels that would feed Kenku's own output back into itself */
export const VIRTUAL_MIC_INPUT_LABELS = [
  VIRTUAL_MIC_SOURCE_LABEL,
  `Monitor of ${VIRTUAL_MIC_SINK_LABEL}`,
];

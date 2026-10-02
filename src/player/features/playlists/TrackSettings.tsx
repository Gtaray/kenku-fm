import React, { useEffect, useState } from "react";
import Button, { ButtonProps } from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Alert, { AlertColor } from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { useDispatch } from "react-redux";
import { editTrack, Track } from "./playlistsSlice";
import { AudioSelector } from "../../common/AudioSelector";
import { clearLoopAnalysis } from "./loopAnalysisSlice";
import {
  hasLoopPoints,
  loopErrorMessage,
  loopUnsupportedReason,
  supportsLoopTags,
  trackFilePath,
} from "./trackLoop";

const LOOP_SOURCE_LABELS: Record<NonNullable<Track["loopSource"]>, string> = {
  tags: "read from the file's loop tags",
  analysis: "found by music-looper",
  manual: "set by hand",
};

function formatSeconds(seconds?: number) {
  return typeof seconds === "number" ? seconds.toFixed(3) : "";
}

/** Shows why a button is disabled */
function LoopButton({
  disabledReason,
  ...props
}: ButtonProps & { disabledReason?: string }) {
  return (
    <Tooltip title={disabledReason ?? ""}>
      <span>
        <Button
          size="small"
          variant="outlined"
          {...props}
          disabled={props.disabled || Boolean(disabledReason)}
        />
      </span>
    </Tooltip>
  );
}

type TrackSettingsProps = {
  track: Track;
  open: boolean;
  onClose: () => void;
};

export function TrackSettings({ track, open, onClose }: TrackSettingsProps) {
  const dispatch = useDispatch();
  const [loopStart, setLoopStart] = useState("");
  const [loopEnd, setLoopEnd] = useState("");
  const [busy, setBusy] = useState<"read" | "analyze" | "write" | null>(null);
  const [message, setMessage] = useState<{
    severity: AlertColor;
    text: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setLoopStart(formatSeconds(track.loopStart));
      setLoopEnd(formatSeconds(track.loopEnd));
    }
  }, [open, track.loopStart, track.loopEnd]);

  useEffect(() => {
    if (open) {
      setMessage(null);
    }
  }, [open, track.id]);

  const filePath = trackFilePath(track);
  const unsupportedReason = loopUnsupportedReason(track);
  const toolMissingReason = window.player.looperAvailable
    ? undefined
    : "music-looper isn't installed";
  const tagsReason =
    toolMissingReason ??
    (filePath && !supportsLoopTags(filePath)
      ? "Loop tags are only supported in FLAC files"
      : undefined);
  const fieldsEdited =
    loopStart !== formatSeconds(track.loopStart) ||
    loopEnd !== formatSeconds(track.loopEnd);

  function handleTitleChange(event: React.ChangeEvent<HTMLInputElement>) {
    dispatch(editTrack({ id: track.id, title: event.target.value }));
  }

  function handleTitleStringChange(title: string) {
    dispatch(editTrack({ id: track.id, title }));
  }

  function handleURLChange(url: string) {
    if (url === track.url) {
      return;
    }
    // Saved loop points belong to the old file
    dispatch(
      editTrack({
        id: track.id,
        url,
        loopStart: undefined,
        loopEnd: undefined,
        loopSource: undefined,
      })
    );
    dispatch(clearLoopAnalysis(track.id));
  }

  function parseLoopFields(): { start: number; end: number } {
    const start = Number.parseFloat(loopStart);
    const end = Number.parseFloat(loopEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error("Loop start and end must be numbers of seconds");
    }
    if (start < 0 || end <= start) {
      throw new Error("Loop end must be after loop start");
    }
    return { start, end };
  }

  async function runLoopTool(
    action: "read" | "analyze" | "write",
    run: () => Promise<string>
  ) {
    setBusy(action);
    setMessage(null);
    try {
      setMessage({ severity: "success", text: await run() });
    } catch (error) {
      setMessage({ severity: "error", text: loopErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  function handleReadTags() {
    runLoopTool("read", async () => {
      const tags = await window.player.readLoopTags(filePath);
      if (tags.start === undefined || tags.end === undefined) {
        throw new Error("This file has no loop tags");
      }
      dispatch(
        editTrack({
          id: track.id,
          loopStart: tags.start,
          loopEnd: tags.end,
          loopSource: "tags",
        })
      );
      dispatch(clearLoopAnalysis(track.id));
      return "Loop points read from the file's tags";
    });
  }

  function handleAnalyze() {
    runLoopTool("analyze", async () => {
      const points = await window.player.analyzeLoop(filePath);
      dispatch(
        editTrack({
          id: track.id,
          loopStart: points.start,
          loopEnd: points.end,
          loopSource: "analysis",
        })
      );
      dispatch(clearLoopAnalysis(track.id));
      return "Loop points found";
    });
  }

  function handleApply() {
    try {
      const { start, end } = parseLoopFields();
      dispatch(
        editTrack({
          id: track.id,
          loopStart: start,
          loopEnd: end,
          loopSource: "manual",
        })
      );
      setMessage({ severity: "success", text: "Loop points applied" });
    } catch (error) {
      setMessage({ severity: "error", text: loopErrorMessage(error) });
    }
  }

  function handleWriteTags() {
    runLoopTool("write", async () => {
      // Unedited fields are rounded, so write the saved points instead
      let start = track.loopStart;
      let end = track.loopEnd;
      if (fieldsEdited || !hasLoopPoints(track)) {
        ({ start, end } = parseLoopFields());
        dispatch(
          editTrack({
            id: track.id,
            loopStart: start,
            loopEnd: end,
            loopSource: "manual",
          })
        );
      }
      await window.player.writeLoopTags(filePath, start, end);
      return "Loop tags written to the file";
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      // Stop key events from propagating to prevent the track drag and drop from stealing the space bar
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <DialogTitle>Edit Track</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <AudioSelector
            value={track.url}
            onChange={handleURLChange}
            onFileName={handleTitleStringChange}
          />
          <TextField
            margin="dense"
            id="name"
            label="Name"
            fullWidth
            variant="standard"
            autoComplete="off"
            InputLabelProps={{
              shrink: true,
            }}
            value={track.title}
            onChange={handleTitleChange}
          />
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2">Loop</Typography>
          {!unsupportedReason ? (
            <>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  margin="dense"
                  label="Loop Start (sec)"
                  fullWidth
                  variant="standard"
                  autoComplete="off"
                  value={loopStart}
                  onChange={(event) => setLoopStart(event.target.value)}
                />
                <TextField
                  margin="dense"
                  label="Loop End (sec)"
                  fullWidth
                  variant="standard"
                  autoComplete="off"
                  value={loopEnd}
                  onChange={(event) => setLoopEnd(event.target.value)}
                />
              </Stack>
              {track.loopSource && !fieldsEdited && (
                <Typography variant="caption" color="text.secondary">
                  Loop points {LOOP_SOURCE_LABELS[track.loopSource]}
                </Typography>
              )}
              <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                <LoopButton
                  onClick={handleReadTags}
                  disabled={Boolean(busy)}
                  disabledReason={tagsReason}
                >
                  {busy === "read" ? "Reading..." : "Read Tags"}
                </LoopButton>
                <LoopButton
                  onClick={handleAnalyze}
                  disabled={Boolean(busy)}
                  disabledReason={toolMissingReason}
                >
                  {busy === "analyze" ? "Analyzing..." : "Analyze"}
                </LoopButton>
                <LoopButton onClick={handleApply} disabled={Boolean(busy)}>
                  Apply
                </LoopButton>
                <LoopButton
                  onClick={handleWriteTags}
                  disabled={Boolean(busy) || (!loopStart && !loopEnd)}
                  disabledReason={tagsReason}
                >
                  {busy === "write" ? "Writing..." : "Write Tags"}
                </LoopButton>
              </Box>
              {message && (
                <Alert severity={message.severity} sx={{ mt: 1.5 }}>
                  {message.text}
                </Alert>
              )}
            </>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {unsupportedReason}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button type="submit">Done</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

# Bug Report: Genie Omni-Bridge `tmux send-keys` corrupts long commands with special characters

## Summary
When the Genie Omni-Bridge spawns an agent session via `tmux send-keys`, commands ~1968+ characters containing special characters (backticks, emojis, parentheses, nested quotes) are corrupted/truncated before reaching the zsh shell. This causes `zsh: parse error near \`)\'` or leaves zsh in a continuation prompt (`>`). The exact same command executes perfectly when run directly in a shell.

## Environment
- **OS**: macOS (Darwin 22.3.0, ARM64)
- **Genie version**: Latest (installed 2026-05-26)
- **tmux version**: 3.6a
- **Shell**: zsh (with oh-my-zsh / standard config)
- **Claude Code**: 2.1.108
- **Omni**: 2.260410.1

## Reproduction Steps
1. Configure a Genie agent connected to Omni (WhatsApp via Baileys)
2. Send a WhatsApp message to trigger the agent
3. Genie Omni-Bridge spawns a tmux session and sends the launch command via `tmux send-keys`
4. Observe the tmux pane: zsh shows `parse error near \`)\'` or `>` continuation prompt
5. Copy the exact command from `~/.genie/logs/tmux-cmds.log` and run it directly in a terminal → works perfectly

## Evidence

### 1. Command size and special characters
The generated command is ~1968 bytes and contains:
- Nested single quotes with `\'` escape sequences
- Backticks (`` ` ``) used in the system prompt
- Unicode emojis (👍)
- Parentheses `(instance: ...)`, `(ALWAYS your last action)`
- JSON settings object with escaped quotes

### 2. Direct execution works
Running the exact command from `tmux-cmds.log` directly in zsh:
```bash
OMNI_API_KEY='...' ... /opt/homebrew/bin/claude --permission-mode 'auto' ... '[WhatsApp Turn ...]'
```
→ **Executes successfully** and Claude Code spawns correctly.

### 3. tmux send-keys fails
The same command sent via `tmux send-keys`:
```bash
tmux -L genie send-keys -t '%N' "OMNI_API_KEY='...' ... '[WhatsApp Turn ...]\n...oi'" Enter
```
→ Results in:
```
zsh: parse error near `)'
```

### 4. zsh continuation prompt observed
In a clean tmux test session, sending the full command results in zsh showing:
```
> 
```
Indicating the command was truncated or quotes were unbalanced during transmission.

### 5. Pure long commands work
A test command of 1960 pure ASCII characters sent via `tmux send-keys` executes correctly. This isolates the issue to **special characters + length**, not length alone.

## Root Cause Analysis
The `tmux send-keys` command has limitations when transmitting:
1. Very long strings with mixed quote types
2. Backtick characters that may be interpreted as tmux key sequences
3. Multi-byte Unicode characters (emojis) that may be split at buffer boundaries
4. JSON-escaped quotes inside shell-quoted strings

The Genie Omni-Bridge constructs the entire Claude Code launch command as a single string argument to `tmux send-keys`, which becomes unreliable at ~2000 chars with complex character mixes.

## Suggested Fix
Instead of using `tmux send-keys` with an inline command string, Genie should:

1. **Write the command to a temporary shell script file**, e.g.:
   ```bash
   /tmp/genie-agent-<id>-launch.sh
   ```
2. **Send a minimal `source` command via `tmux send-keys`**:
   ```bash
   tmux send-keys -t '%N' "source /tmp/genie-agent-<id>-launch.sh" Enter
   ```
3. **Clean up the temp file after execution** (or on agent death)

This avoids all `send-keys` escaping issues and makes the command reproducible and debuggable.

## Workarounds Attempted (and why they failed)
- `--bare` flag + API key wrapper: Wrapper works manually, but `send-keys` corruption prevents the command from even reaching the wrapper.
- Stripping `--resume`: Command still fails at the `send-keys` layer before Claude Code executes.

## Impact
- **Agents cannot spawn** via Omni-Bridge when WhatsApp messages trigger them
- The entire reactive path (WhatsApp → Omni → Genie → Claude) is broken
- Only affects messages that generate long system prompts (most real-world messages)

## Logs
- `~/.genie/logs/tmux-cmds.log` shows the exact commands being sent
- `~/.genie/logs/genie-serve-out.log` shows "Dead session detected" after every spawn attempt

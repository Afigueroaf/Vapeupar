// Avisa si la sesion se abrio con el config global en vez del aislado de Vapeupar.
// Ver .claude/settings.json (hook SessionStart) y claude-vp.cmd.
const dir = process.env.CLAUDE_CONFIG_DIR || "";

if (!dir.replace(/\\/g, "/").toLowerCase().includes(".claude-vapeupar")) {
  const aviso =
    "Esta sesion NO usa el config aislado de Vapeupar. Cierrala y reabre el " +
    "proyecto con claude-vp.cmd, que exporta CLAUDE_CONFIG_DIR. Con el config " +
    "global se carga contexto de infraestructura de otro proyecto (DeliPan) y " +
    "una carpeta de memoria distinta.";

  process.stdout.write(
    JSON.stringify({
      systemMessage: "[Vapeupar] " + aviso,
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: aviso + " Avisale al usuario antes de seguir.",
      },
    })
  );
}

process.exit(0);

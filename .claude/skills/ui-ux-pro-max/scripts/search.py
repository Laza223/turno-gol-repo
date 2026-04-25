import sys, os, runpy

REAL = os.path.join(
    os.path.expanduser("~"),
    ".claude", "plugins", "cache", "ui-ux-pro-max-skill",
    "ui-ux-pro-max", "2.5.0", "cli", "assets", "scripts", "search.py"
)

if not os.path.exists(REAL):
    print(f"ERROR: ui-ux-pro-max script not found at:\n  {REAL}", file=sys.stderr)
    sys.exit(1)

sys.argv[0] = REAL
runpy.run_path(REAL, run_name="__main__")

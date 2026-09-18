import { execFileSync } from "node:child_process";

// Runs from `npm prepare`. Installs outside a git checkout (for example from a
// packed tarball) have no hooks to configure, so that case exits cleanly.
function insideGitCheckout() {
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (insideGitCheckout())
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    stdio: "inherit",
  });

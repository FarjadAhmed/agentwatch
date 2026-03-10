// agentwatch — shared risk assessment
// Returns array of { level: 'critical'|'warning'|'info', msg: string }

function assessRisk(entry) {
  const risks = [];

  if (entry.tool === 'Bash' && entry.command) {
    const cmd = entry.command;

    // Critical
    if (/\brm\s+-[a-z]*r/i.test(cmd) || /\brm\s+--recursive/i.test(cmd))
      risks.push({ level: 'critical', msg: 'Recursive delete (rm -r)' });
    if (/\bfind\b.*(-exec\s+rm\b|-delete\b)/.test(cmd))
      risks.push({ level: 'critical', msg: 'Find with delete' });
    if (/(curl|wget).*\|\s*(sh|bash|zsh)/.test(cmd))
      risks.push({ level: 'critical', msg: 'Pipe to shell' });
    if (/\bsudo\s/.test(cmd))
      risks.push({ level: 'critical', msg: 'Elevated privileges (sudo)' });
    if (/\bgit\s+push\b.*--force\b(?!-with-lease)/.test(cmd) || /\bgit\s+push\b.*\s-f\b/.test(cmd))
      risks.push({ level: 'critical', msg: 'Force push' });
    if (/\bgit\s+reset\s+--hard\b/.test(cmd))
      risks.push({ level: 'critical', msg: 'Hard reset (destructive)' });
    if (/>\s*\/etc\/|>\s*\/usr\/|>\s*\/var\//.test(cmd))
      risks.push({ level: 'critical', msg: 'Writing to system directory' });
    if (/\bmkfs\b/.test(cmd))
      risks.push({ level: 'critical', msg: 'Filesystem format (mkfs)' });
    if (/\bdd\s+.*\bif=/.test(cmd))
      risks.push({ level: 'critical', msg: 'Raw disk write (dd)' });

    // Warning
    if (/\bgit\s+push\b.*--force-with-lease\b/.test(cmd))
      risks.push({ level: 'warning', msg: 'Force push (with lease)' });
    if (/\brm\s/.test(cmd) && !risks.some(r => r.msg.includes('rm') || r.msg.includes('Find')))
      risks.push({ level: 'warning', msg: 'File deletion (rm)' });
    if (/\b(curl|wget)\s/.test(cmd) && !/localhost|127\.0\.0\.1/.test(cmd) && !risks.some(r => r.msg === 'Pipe to shell'))
      risks.push({ level: 'warning', msg: 'Network request to external host' });
    if (/\beval\s/.test(cmd))
      risks.push({ level: 'warning', msg: 'Dynamic eval' });
    if (/\bssh\s|\bscp\s/.test(cmd))
      risks.push({ level: 'warning', msg: 'Remote connection' });
    if (/\bkill\s+-9\b|\bkill\s+-KILL\b|\bpkill\b|\bkillall\b/.test(cmd))
      risks.push({ level: 'warning', msg: 'Process termination' });
    if ((/\.env\b|secret|password|token|api[._-]?key/i.test(cmd)) && !/\/usr\/bin\/env\b/.test(cmd) && !/node_modules/.test(cmd) && !/\.env\./.test(cmd))
      risks.push({ level: 'warning', msg: 'Possible secrets access' });

    // Info
    if (/\bpip\s+install\b|\bnpm\s+install\b|\bbrew\s+install\b/.test(cmd))
      risks.push({ level: 'info', msg: 'Package installation' });
    if (/\bdocker\s+run\b/.test(cmd))
      risks.push({ level: 'info', msg: 'Container execution' });
  }

  if (entry.tool === 'Write' && entry.file) {
    if (/\/\.env$|\/\.ssh\/|\/\.aws\/|\/credentials$|\/\.netrc$/.test(entry.file))
      risks.push({ level: 'critical', msg: 'Writing to sensitive file' });
    if (entry.file.startsWith('/etc/') || entry.file.startsWith('/usr/'))
      risks.push({ level: 'critical', msg: 'Writing to system directory' });
  }

  if (entry.tool === 'Read' && entry.file) {
    if (/\/\.env$|\/\.ssh\/|\/\.aws\/|\/credentials$|\/\.netrc$|\/id_rsa$/.test(entry.file))
      risks.push({ level: 'warning', msg: 'Reading sensitive file' });
  }

  if (entry.tool === 'WebFetch' && entry.url) {
    risks.push({ level: 'info', msg: 'External web request' });
  }

  return risks;
}

module.exports = { assessRisk };

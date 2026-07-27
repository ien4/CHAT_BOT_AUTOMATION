'use strict';

const SCRIPT_NAME = 'update-chatwoot-agentbot-url.js';
const CODE = 'LEGACY_SCRIPT_QUARANTINED';

const QUARANTINE_METADATA = Object.freeze({
  code: CODE,
  script: SCRIPT_NAME,
  status: 'disabled',
  replacement: 'target-authorized provider operation in a reviewed phase',
});

function main(io) {
  const output = io && io.stderr ? io.stderr : process.stderr;
  output.write(
    CODE + ' script=' + SCRIPT_NAME
    + ' status=disabled reason=legacy-global-agentbot-updater replacement=target-authorized-reviewed-provider-operation\n',
  );
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = Object.freeze({
  main,
  QUARANTINE_METADATA,
});

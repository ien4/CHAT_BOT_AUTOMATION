'use strict';

const SCRIPT_NAME = 'fix_tenant_token.js';
const CODE = 'LEGACY_SCRIPT_QUARANTINED';

const QUARANTINE_METADATA = Object.freeze({
  code: CODE,
  script: SCRIPT_NAME,
  status: 'disabled',
  replacement: 'approved IntegrationCredential provisioning process',
});

function main(io) {
  const output = io && io.stderr ? io.stderr : process.stderr;
  output.write(
    CODE + ' script=' + SCRIPT_NAME
    + ' status=disabled reason=legacy-administrative-mutation replacement=approved-IntegrationCredential-provisioning-process\n',
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

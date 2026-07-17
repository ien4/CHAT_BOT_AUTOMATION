const assert = require('assert');

const PREFIX = 'p0appt_';
let seq = 0;

const state = {
  appointments: [],
  conversations: [],
};

function nextId(kind) {
  seq += 1;
  return `${PREFIX}${kind}_${seq}`;
}

function timestamp() {
  seq += 1;
  return new Date(Date.UTC(2026, 0, 1, 0, 0, seq));
}

function matchValue(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (Object.prototype.hasOwnProperty.call(expected, 'in')) {
      return expected.in.includes(actual);
    }
    if (Object.prototype.hasOwnProperty.call(expected, 'not')) {
      return actual !== expected.not;
    }
  }
  return actual === expected;
}

function matchesWhere(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => matchValue(row[key], expected));
}

function orderRows(rows, orderBy) {
  if (!orderBy?.createdAt) return rows;
  const direction = orderBy.createdAt;
  return [...rows].sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    return direction === 'desc' ? right - left : left - right;
  });
}

function addConversation(id, tenantId, fbUserId) {
  const conversation = {
    id,
    tenantId,
    fbUserId,
    fbUserName: 'Fixture Customer',
    status: 'active',
  };
  state.conversations.push(conversation);
  return conversation;
}

function addAppointment(data) {
  const appointment = {
    id: data.id || nextId('appointment'),
    conversationId: data.conversationId,
    fbUserId: data.fbUserId,
    fbUserName: data.fbUserName || 'Fixture Customer',
    date: data.date,
    time: data.time,
    phone: data.phone || '0000000000',
    email: null,
    notes: data.notes || '',
    status: data.status || 'pending',
    tenantId: data.tenantId,
    createdAt: data.createdAt || timestamp(),
    updatedAt: data.updatedAt || timestamp(),
  };
  state.appointments.push(appointment);
  return appointment;
}

const prismaMock = {
  appointment: {
    async findFirst(args = {}) {
      const rows = state.appointments.filter((row) => matchesWhere(row, args.where || {}));
      return orderRows(rows, args.orderBy)[0] || null;
    },
    async create(args) {
      return addAppointment(args.data);
    },
    async updateMany(args) {
      let count = 0;
      for (const row of state.appointments) {
        if (matchesWhere(row, args.where || {})) {
          Object.assign(row, args.data, { updatedAt: timestamp() });
          count += 1;
        }
      }
      return { count };
    },
  },
  conversation: {
    async updateMany(args) {
      let count = 0;
      for (const row of state.conversations) {
        if (matchesWhere(row, args.where || {})) {
          Object.assign(row, args.data);
          count += 1;
        }
      }
      return { count };
    },
  },
  message: {
    async findMany() {
      return [];
    },
  },
};

function mockModule(modulePath, exportsValue) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsValue,
  };
}

mockModule('../src/db', () => prismaMock);
mockModule('../src/rag/pipeline', {
  search: async () => [],
  formatContext: () => '',
});
mockModule('../src/notifications/appointments', {
  booked: async () => {},
  cancelled: async () => {},
  rescheduled: async () => {},
  updated: async () => {},
  statusChanged: async () => {},
});
mockModule('../src/notifications/alertQueue', {
  alert: async () => {},
});
mockModule('../src/notifications/formatters', {
  ragMissStreak: () => '',
});

const { executeTool } = require('../src/bot/tools');

function contextFor(conversation, tenantId = conversation.tenantId) {
  return { conversation, tenantId, knowledgeFilter: [] };
}

function assertTenantOnly(tenantId, predicate, message) {
  const leaked = state.appointments.some((row) => row.tenantId !== tenantId && predicate(row));
  assert.ok(!leaked, message);
}

async function main() {
  console.log('===APPOINTMENT TENANT ISOLATION SMOKE (MOCK, no DB/external)===');

  const tenantA = { id: `${PREFIX}tenant_a` };
  const tenantB = { id: `${PREFIX}tenant_b` };
  const sameFbUserId = `${PREFIX}same_user`;
  const conversationA = addConversation(`${PREFIX}conversation_a`, tenantA.id, sameFbUserId);
  const conversationB = addConversation(`${PREFIX}conversation_b`, tenantB.id, sameFbUserId);

  addAppointment({
    id: `${PREFIX}tenant_b_existing`,
    conversationId: conversationB.id,
    fbUserId: sameFbUserId,
    tenantId: tenantB.id,
    date: '2026-08-01',
    time: '10:00',
    status: 'pending',
    phone: '0000000002',
  });

  const createA = await executeTool('create_appointment', {
    name: 'Fixture A',
    phone: '0000000001',
    date: '2026-08-01',
    time: '09:00',
  }, contextFor(conversationA));
  assert.ok(createA.success === true, 'A create should not be blocked by B appointment');
  assert.ok(state.appointments.some((row) => row.tenantId === tenantA.id && row.date === '2026-08-01'), 'A appointment should be created in A tenant');

  const duplicateA = await executeTool('create_appointment', {
    name: 'Fixture A',
    phone: '0000000001',
    date: '2026-08-01',
    time: '11:00',
  }, contextFor(conversationA));
  assert.ok(duplicateA.success === false, 'A duplicate should be blocked only inside A tenant');
  console.log('PASS A create dedup isolation');

  const checkA = await executeTool('check_appointment', {}, contextFor(conversationA));
  assert.ok(checkA.found === true && checkA.appointment.time === '09:00', 'A check should return A appointment');
  console.log('PASS B check isolation');

  const cancelA = await executeTool('cancel_appointment', { reason: 'fixture' }, contextFor(conversationA));
  assert.ok(cancelA.success === true, 'A cancel should succeed');
  assert.ok(state.appointments.find((row) => row.id === `${PREFIX}tenant_b_existing`).status === 'pending', 'A cancel must not cancel B');
  console.log('PASS C cancel isolation');

  addAppointment({
    id: `${PREFIX}tenant_a_reschedule`,
    conversationId: conversationA.id,
    fbUserId: sameFbUserId,
    tenantId: tenantA.id,
    date: '2026-08-02',
    time: '08:00',
    status: 'pending',
    phone: '0000000001',
  });

  const rescheduleA = await executeTool('reschedule_appointment', {
    new_date: '2026-08-01',
    new_time: '12:00',
    reason: 'fixture',
  }, contextFor(conversationA));
  assert.ok(rescheduleA.success === true, 'A reschedule should ignore B date conflict');
  assertTenantOnly(tenantA.id, (row) => row.time === '12:00', 'A reschedule must not mutate B');
  console.log('PASS D reschedule isolation');

  const updateA = await executeTool('update_appointment', {
    name: 'Fixture A Updated',
    phone: '0000000003',
  }, contextFor(conversationA));
  assert.ok(updateA.success === true, 'A update should succeed');
  assert.ok(state.appointments.find((row) => row.id === `${PREFIX}tenant_b_existing`).phone === '0000000002', 'A update must not change B');
  console.log('PASS E update isolation');

  const checkB = await executeTool('check_appointment', {}, contextFor(conversationB));
  assert.ok(checkB.found === true && checkB.appointment.time === '10:00', 'B check should return B appointment');
  const updateB = await executeTool('update_appointment', {
    name: 'Fixture B Updated',
  }, contextFor(conversationB));
  assert.ok(updateB.success === true, 'B update should mutate B tenant record');
  assertTenantOnly(tenantB.id, (row) => row.fbUserName === 'Fixture B Updated', 'B mutation must not mutate A');
  console.log('PASS F tenant B read and mutation symmetry');

  const missingTenantConversation = addConversation(`${PREFIX}conversation_missing`, null, sameFbUserId);
  const beforeMissing = state.appointments.length;
  const missingTenant = await executeTool('create_appointment', {
    name: 'Fixture Missing',
    phone: '0000000004',
    date: '2026-08-03',
    time: '13:00',
  }, contextFor(missingTenantConversation, null));
  assert.ok(missingTenant.success === false, 'Missing tenant should fail closed');
  assert.ok(state.appointments.length === beforeMissing, 'Missing tenant must not create appointment');
  console.log('PASS G missing tenant fail-closed');

  const tenantIdsForSameUser = new Set(
    state.appointments
      .filter((row) => row.fbUserId === sameFbUserId)
      .map((row) => row.tenantId)
  );
  assert.ok(tenantIdsForSameUser.has(tenantA.id) && tenantIdsForSameUser.has(tenantB.id), 'Same user must keep separate tenant records');
  console.log('PASS H same user stays tenant-scoped');

  state.appointments = state.appointments.filter((row) => !row.id.startsWith(PREFIX));
  state.conversations = state.conversations.filter((row) => !row.id.startsWith(PREFIX));
  assert.ok(state.appointments.length === 0 && state.conversations.length === 0, 'Cleanup should remove fixture records');
  console.log('PASS I cleanup verified');

  console.log('[smoke:appointment-tenant-isolation] MOCK_PASS');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[smoke:appointment-tenant-isolation] FAILED', { name: error.name, message: error.message });
    process.exit(1);
  });

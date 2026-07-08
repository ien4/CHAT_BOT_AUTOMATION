const HANDOFF_SETTINGS_ID = 'singleton';

const DEFAULT_HANDOFF_SETTINGS = {
  pendingTimeoutSeconds: 30,
  sessionTimeoutSeconds: 30,
  offHoursPendingTimeout: 10,
  workHoursStart: 8,
  workHoursEnd: 22,
};

function createHandoffSettingsRepository({ prisma }) {
  return {
    findSingleton() {
      return prisma.handoffSetting.findUnique({ where: { id: HANDOFF_SETTINGS_ID } });
    },

    createDefault(data = {}) {
      return prisma.handoffSetting.create({
        data: { id: HANDOFF_SETTINGS_ID, ...DEFAULT_HANDOFF_SETTINGS, ...data },
      });
    },

    upsertSingleton(data) {
      const {
        pendingTimeoutSeconds,
        sessionTimeoutSeconds,
        offHoursPendingTimeout,
        workHoursStart,
        workHoursEnd,
      } = data;

      return prisma.handoffSetting.upsert({
        where: { id: HANDOFF_SETTINGS_ID },
        update: { pendingTimeoutSeconds, sessionTimeoutSeconds, offHoursPendingTimeout, workHoursStart, workHoursEnd },
        create: {
          id: HANDOFF_SETTINGS_ID,
          pendingTimeoutSeconds: pendingTimeoutSeconds ?? 30,
          sessionTimeoutSeconds: sessionTimeoutSeconds ?? 30,
          offHoursPendingTimeout: offHoursPendingTimeout ?? 10,
          workHoursStart,
          workHoursEnd,
        },
      });
    },
  };
}

module.exports = createHandoffSettingsRepository;

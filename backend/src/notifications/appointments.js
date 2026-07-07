const manager = require('./telegramManager');
const formatters = require('./formatters');
const telegramDestinations = require('./telegramDestinations');

function appointmentName(appointment, fallback = 'Khách hàng') {
  return appointment?.fbUserName || fallback;
}

function appointmentLink() {
  return telegramDestinations.dashboardUrl('/dashboard/appointments');
}

async function sendToManagerAndStatus(messageForManager, messageForStatus) {
  await Promise.allSettled([
    manager.send(messageForManager),
    telegramDestinations.sendStatus(messageForStatus, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  ]);
}

async function booked(appointment) {
  const name = appointmentName(appointment);
  await sendToManagerAndStatus(
    formatters.appointmentBooked(name, appointment?.date || '?', appointment?.time || '?'),
    formatters.appointmentBooked(name, appointment?.date || '?', appointment?.time || '?', appointmentLink())
  );
}

async function rescheduled(appointment, oldDate, oldTime) {
  const name = appointmentName(appointment);
  await sendToManagerAndStatus(
    formatters.appointmentRescheduled(name, oldDate || '?', oldTime || '?', appointment?.date || '?', appointment?.time || '?'),
    formatters.appointmentRescheduled(name, oldDate || '?', oldTime || '?', appointment?.date || '?', appointment?.time || '?', appointmentLink())
  );
}

async function cancelled(appointment, reason = '') {
  const name = appointmentName(appointment);
  await sendToManagerAndStatus(
    formatters.appointmentCancelled(name, appointment?.date || '?', appointment?.time || '?', reason),
    formatters.appointmentCancelled(name, appointment?.date || '?', appointment?.time || '?', reason, appointmentLink())
  );
}

async function updated(appointment, changes = []) {
  const name = appointmentName(appointment);
  await sendToManagerAndStatus(
    formatters.appointmentUpdated(name, appointment?.date || '?', appointment?.time || '?', changes),
    formatters.appointmentUpdated(name, appointment?.date || '?', appointment?.time || '?', changes, appointmentLink())
  );
}

async function statusChanged(appointment, oldStatus, newStatus) {
  const name = appointmentName(appointment);
  await sendToManagerAndStatus(
    formatters.appointmentStatusChanged(name, appointment?.date || '?', appointment?.time || '?', oldStatus, newStatus),
    formatters.appointmentStatusChanged(name, appointment?.date || '?', appointment?.time || '?', oldStatus, newStatus, appointmentLink())
  );
}

module.exports = {
  booked,
  cancelled,
  rescheduled,
  statusChanged,
  updated,
};

/* =========================================================
   AMANAH ATTENDANCE - DELETE ACTION HANDLER
   ---------------------------------------------------------
   The DELETE buttons are rendered dynamically, so they need
   delegated click handling. Only SUPER ADMIN can open/confirm
   the delete action; the database RPC remains the final guard.
   ========================================================= */

(function () {
  function getAttendanceRow(attendanceId) {
    let rows = [];

    try {
      rows = Array.isArray(allAttendance) ? allAttendance : [];
    } catch (error) {
      rows = [];
    }

    return rows.find(
      row => String(row.attendance_id || '') === String(attendanceId || '')
    ) || null;
  }

  document.addEventListener('click', function (event) {
    const deleteButton = event.target.closest('[data-delete-attendance]');

    if (deleteButton) {
      event.preventDefault();

      const attendanceId = deleteButton.getAttribute('data-delete-attendance');
      const row = getAttendanceRow(attendanceId);

      if (!row) {
        showMessage('The selected attendance record could not be found. Please refresh the page.');
        return;
      }

      openDeleteAttendanceModal(row);
      return;
    }

    if (event.target.closest('#cancelDeleteAttendance') ||
        event.target.closest('#cancelDeleteAttendanceTop') ||
        event.target.classList.contains('delete-modal-backdrop')) {
      closeDeleteAttendanceModal();
      return;
    }

    if (event.target.closest('#confirmDeleteAttendance')) {
      event.preventDefault();
      confirmDeleteAttendance();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      const modal = document.getElementById('deleteAttendanceModal');
      if (modal && modal.classList.contains('is-open')) {
        closeDeleteAttendanceModal();
      }
    }
  });
})();

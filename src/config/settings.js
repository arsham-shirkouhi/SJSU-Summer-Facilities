export const SETTINGS = {
  // Laundry
  laundry: {
    estimatedCycleMinutes: 45,
    estimatedDryMinutes: 30,
    totalCycleMinutes: 75,
    overdueThresholdMinutes: 90,
    washingMachines: [1, 2, 3, 4, 5, 6],
    maxMachineNumber: 40,
    cycleDurationOptions: [45, 60, 75, 90, 120],
    maxConcurrentLoads: 6,
  },

  // Inventory
  inventory: {
    lowThreshold: 15,
    criticalThreshold: 5,
    countIncrements: [1, 5, 10, 20, 50],
  },

  // Storage rooms
  storageRooms: ['Storage A', 'Storage B', 'Storage C'],

  // Linen item types
  itemTypes: [
    { key: 'twin_sheets', label: 'Twin Bed Sheets' },
    { key: 'pillowcases', label: 'Pillowcases' },
    { key: 'bath_towels', label: 'Bath Towels' },
    { key: 'hand_towels', label: 'Hand Towels' },
    { key: 'blankets', label: 'Blankets' },
  ],

  // Notifications
  notifications: {
    pickupReminderDaysBefore: 2,
    uncountedShelfHours: 24,
    laundryOverdueMinutes: 90,
  },

  // Buildings (for linen pickup tracking)
  buildings: ['CVA', 'OGH', 'Joe West', 'Mailroom', 'P1', 'SVP'],

  // Weekly pickup mission item types
  missionItems: [
    { key: 'face_towels', label: 'Face Towels' },
    { key: 'body_towels', label: 'Body Towels' },
    { key: 'top_sheets', label: 'Top Sheets' },
    { key: 'pillow_cases', label: 'Pillow Cases' },
  ],

  // App
  app: {
    appName: 'LinenTrack',
    orgName: 'SJSU Summer Housing',
    sessionTimeoutMinutes: 480,
  },
}

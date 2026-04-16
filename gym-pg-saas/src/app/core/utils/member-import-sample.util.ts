/** Same rows as the downloadable sample Excel (PG vs gym). */
export function memberImportSampleAoA(isPg: boolean): (string | number)[][] {
  const header = ['name', 'mobile', 'plan', 'dueDate', 'subscriptionType', 'floor', 'room', 'bed'];
  if (isPg) {
    return [
      header,
      ['Ravi Kumar', '9876543210', 4000, '2026-04-30', 'monthly', '', '101', 1],
      ['Priya Singh', '9988776655', 5000, '2026-05-15', 'monthly', 2, 4, 2],
      ['Amit Patel', '9123456789', 3500, '2026-06-10', 'monthly', '', '407', 1],
    ];
  }
  return [
    header,
    ['Ravi Kumar', '9876543210', 2500, '2026-04-30', 'monthly', '', '', ''],
    ['Anita Sharma', '9988776655', 3200, '2026-05-15', 'quarterly', '', '', ''],
    ['Vikram Singh', '9123456789', 2000, '2026-05-20', 'monthly', '', '', ''],
  ];
}

/** CSV text for the built-in sample (used for in-app preview). */
export function memberImportSampleCsv(isPg: boolean): string {
  return memberImportSampleAoA(isPg)
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
}
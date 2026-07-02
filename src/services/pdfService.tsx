import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { FinancialReport, MyData, PharmacyReport } from '../data/types';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  title: { fontSize: 16, marginBottom: 4, color: '#0f9d77' },
  subtitle: { fontSize: 9, marginBottom: 16, color: '#64748b' },
  row: { marginBottom: 6 },
  sectionTitle: { fontSize: 12, marginTop: 14, marginBottom: 6, color: '#0a5041' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metricLabel: { color: '#475569' },
  metricValue: { fontWeight: 700 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#0f9d77', paddingBottom: 3, marginBottom: 3 },
  tr: { flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  cell: { flex: 1, fontSize: 9 },
  cellHead: { flex: 1, fontSize: 9, fontWeight: 700, color: '#0a5041' },
});

interface PdfData {
  kind: 'prescription' | 'transfer';
  patientName: string;
  doctorName: string;
  clinicName: string;
  date: string;
  notes: string;
}

function PdfDoc({ data }: { data: PdfData }) {
  const title = data.kind === 'prescription' ? 'Prescription' : 'Transfer Slip';
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Gara — {title}</Text>
        <View style={styles.row}>
          <Text>Patient: {data.patientName}</Text>
        </View>
        <View style={styles.row}>
          <Text>Doctor: {data.doctorName}</Text>
        </View>
        <View style={styles.row}>
          <Text>Clinic: {data.clinicName}</Text>
        </View>
        <View style={styles.row}>
          <Text>Date: {data.date}</Text>
        </View>
        <View style={{ marginTop: 16 }}>
          <Text>{data.notes}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateClinicalPdf(data: PdfData): Promise<Blob> {
  return pdf(<PdfDoc data={data} />).toBlob();
}

const money = (n: number) => `${n.toLocaleString()} RWF`;
const fmtDate = (iso: string) => new Date(iso).toLocaleString();

function FinancialReportDoc({ data, clinicName }: { data: FinancialReport; clinicName: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Gara — Financial Report</Text>
        <Text style={styles.subtitle}>
          {clinicName} · Generated {fmtDate(data.generatedAt)}
        </Text>

        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Today's income</Text>
          <Text style={styles.metricValue}>{money(data.todayIncome)}</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>This month's income</Text>
          <Text style={styles.metricValue}>{money(data.monthIncome)}</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Total income (all time)</Text>
          <Text style={styles.metricValue}>{money(data.totalIncome)}</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Pharmacy revenue (dispensed value)</Text>
          <Text style={styles.metricValue}>{money(data.pharmacyRevenue)}</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Consultations (paid / total)</Text>
          <Text style={styles.metricValue}>
            {data.paidConsultations} / {data.totalConsultations}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Income by day (last 14)</Text>
        <View style={styles.th}>
          <Text style={styles.cellHead}>Date</Text>
          <Text style={styles.cellHead}>Consultations</Text>
          <Text style={styles.cellHead}>Income</Text>
        </View>
        {data.byDay.map((d) => (
          <View key={d.date} style={styles.tr}>
            <Text style={styles.cell}>{d.date}</Text>
            <Text style={styles.cell}>{d.count}</Text>
            <Text style={styles.cell}>{money(d.income)}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Recent payments</Text>
        <View style={styles.th}>
          <Text style={styles.cellHead}>Date</Text>
          <Text style={styles.cellHead}>Patient</Text>
          <Text style={styles.cellHead}>Txn ID</Text>
          <Text style={styles.cellHead}>Amount</Text>
        </View>
        {data.recent.map((r, i) => (
          <View key={i} style={styles.tr}>
            <Text style={styles.cell}>{new Date(r.date).toLocaleDateString()}</Text>
            <Text style={styles.cell}>{r.patientName ?? '—'}</Text>
            <Text style={styles.cell}>{r.txn ?? '—'}</Text>
            <Text style={styles.cell}>{money(r.amount ?? 0)}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

function PharmacyReportDoc({ data, clinicName }: { data: PharmacyReport; clinicName: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Gara — Pharmacy Report</Text>
        <Text style={styles.subtitle}>
          {clinicName} · Generated {fmtDate(data.generatedAt)}
        </Text>

        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Medicines in catalogue</Text>
          <Text style={styles.metricValue}>{data.medicineCount}</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Total stock value</Text>
          <Text style={styles.metricValue}>{money(data.stockValue)}</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Units dispensed (all time)</Text>
          <Text style={styles.metricValue}>{data.totalDispensed}</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Low-stock items</Text>
          <Text style={styles.metricValue}>{data.lowStockCount}</Text>
        </View>

        <Text style={styles.sectionTitle}>Stock levels</Text>
        <View style={styles.th}>
          <Text style={styles.cellHead}>Medicine</Text>
          <Text style={styles.cellHead}>Form</Text>
          <Text style={styles.cellHead}>Qty</Text>
          <Text style={styles.cellHead}>Reorder</Text>
          <Text style={styles.cellHead}>Unit price</Text>
        </View>
        {data.medicines.map((m, i) => (
          <View key={i} style={styles.tr}>
            <Text style={styles.cell}>{m.name}{m.low ? ' (LOW)' : ''}</Text>
            <Text style={styles.cell}>{m.form ?? '—'}</Text>
            <Text style={styles.cell}>{m.quantity}</Text>
            <Text style={styles.cell}>{m.reorderLevel}</Text>
            <Text style={styles.cell}>{money(m.unitPrice)}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Recent dispensing</Text>
        <View style={styles.th}>
          <Text style={styles.cellHead}>Date</Text>
          <Text style={styles.cellHead}>Medicine</Text>
          <Text style={styles.cellHead}>Qty</Text>
          <Text style={styles.cellHead}>Patient</Text>
        </View>
        {data.dispenses.map((d, i) => (
          <View key={i} style={styles.tr}>
            <Text style={styles.cell}>{new Date(d.date).toLocaleDateString()}</Text>
            <Text style={styles.cell}>{d.medicineName ?? '—'}</Text>
            <Text style={styles.cell}>{d.quantity}</Text>
            <Text style={styles.cell}>{d.patientName ?? '—'}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function generateFinancialReportPdf(
  data: FinancialReport,
  clinicName: string
): Promise<Blob> {
  return pdf(<FinancialReportDoc data={data} clinicName={clinicName} />).toBlob();
}

export async function generatePharmacyReportPdf(
  data: PharmacyReport,
  clinicName: string
): Promise<Blob> {
  return pdf(<PharmacyReportDoc data={data} clinicName={clinicName} />).toBlob();
}

function MyDataDoc({ data }: { data: MyData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Gara — My Health Record</Text>
        <Text style={styles.subtitle}>
          {data.patient.fullName} · Exported {fmtDate(new Date().toISOString())}
        </Text>

        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.row}><Text>Phone: {data.patient.phoneNumber ?? '—'}</Text></View>
        <View style={styles.row}><Text>Allergies: {data.patient.allergies ?? 'None recorded'}</Text></View>
        <View style={styles.row}>
          <Text>Chronic conditions: {data.patient.chronicConditions ?? 'None recorded'}</Text>
        </View>
        <View style={styles.row}>
          <Text>Member since: {new Date(data.patient.memberSince).toLocaleDateString()}</Text>
        </View>

        <Text style={styles.sectionTitle}>Consultations ({data.consultations.length})</Text>
        <View style={styles.th}>
          <Text style={styles.cellHead}>Date</Text>
          <Text style={styles.cellHead}>Category</Text>
          <Text style={styles.cellHead}>Severity</Text>
          <Text style={styles.cellHead}>Status</Text>
        </View>
        {data.consultations.map((c) => (
          <View key={c.id} style={styles.tr}>
            <Text style={styles.cell}>{new Date(c.createdAt).toLocaleDateString()}</Text>
            <Text style={styles.cell}>{c.symptomCategory ?? '—'}</Text>
            <Text style={styles.cell}>{c.severity ?? '—'}</Text>
            <Text style={styles.cell}>{c.status}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Medicines received</Text>
        {data.dispenses.length === 0 ? (
          <Text style={styles.row}>None recorded.</Text>
        ) : (
          data.dispenses.map((d, i) => (
            <View key={i} style={styles.tr}>
              <Text style={styles.cell}>{new Date(d.createdAt).toLocaleDateString()}</Text>
              <Text style={styles.cell}>{d.medicineName ?? '—'}</Text>
              <Text style={styles.cell}>x{d.quantity}</Text>
            </View>
          ))
        )}
      </Page>
    </Document>
  );
}

export async function generateMyDataPdf(data: MyData): Promise<Blob> {
  return pdf(<MyDataDoc data={data} />).toBlob();
}

/** Triggers a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

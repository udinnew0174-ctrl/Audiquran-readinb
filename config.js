// Konfigurasi API dan data statis
const API_SURAH_LIST = "https://equran.id/api/v2/surat";
const API_SURAH_DETAIL = (nomor) => `https://equran.id/api/v2/surat/${nomor}`;
const API_TAFSIR = (nomor) => `https://equran.id/api/v2/tafsir/${nomor}`;

const RECITER_MAP = {
  '01': 'Abdullah Al-Juhany',
  '02': 'Abdul Muhsin Al-Qasim',
  '03': 'Abdurrahman as-Sudais',
  '04': 'Ibrahim Al-Dossari',
  '05': 'Misyari Rasyid Al-Afasi',
  '06': 'Yasser Al-Dosari'
};

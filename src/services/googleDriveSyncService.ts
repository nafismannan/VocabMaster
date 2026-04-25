
import { AuthService } from './googleAuthService';

const MASTER_FILENAME = 'VocabMaster_Full_Backup.json';

export interface SyncData {
  vocab: any[];
  phrases: any[];
  translations: any[];
  syncTime: number;
}

export const DriveSyncService = {
  async findMasterFileId(): Promise<string | null> {
    const token = AuthService.getToken();
    if (!token) {
      console.warn("Sync: No token found before searching.");
      return null;
    }

    try {
      console.log(`Sync: Searching for ${MASTER_FILENAME} in appDataFolder...`);
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${MASTER_FILENAME}'&spaces=appDataFolder&fields=files(id,name)`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      
      if (!response.ok) {
        const errText = await response.text();
        console.error(`Sync Search Error: ${response.status} - ${errText}`);
        return null;
      }

      const data = await response.json();
      const files = data.files || [];
      if (files.length > 0) {
        console.log(`Sync: Found existing file with ID: ${files[0].id}`);
        return files[0].id;
      }
      console.log("Sync: No existing master file found.");
      return null;
    } catch (error) {
      console.error('Sync Search Exception:', error);
      return null;
    }
  },

  async downloadData(fileId: string): Promise<SyncData | null> {
    const token = AuthService.getToken();
    if (!token) return null;

    try {
      console.log(`Sync: Downloading data for file ID: ${fileId}`);
      const apiKey = AuthService.getApiKey();
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Sync Download Error: ${response.status} - ${errText}`);
        return null;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Sync Download Exception:', error);
      return null;
    }
  },

  async uploadData(data: SyncData, existingFileId: string | null = null): Promise<boolean> {
    const token = AuthService.getToken();
    if (!token) {
      console.error("Sync Upload: Missing authentication token.");
      return false;
    }

    try {
      console.log(`Sync: Starting ${existingFileId ? 'PATCH' : 'POST'} upload...`);
      
      let url: string;
      let method: string;
      let body: any;
      let headers: Record<string, string> = {
        Authorization: `Bearer ${token}`
      };

      if (existingFileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`;
        method = 'PATCH';
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(data);
      } else {
        url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
        method = 'POST';
        
        const metadata = {
          name: MASTER_FILENAME,
          parents: ['appDataFolder']
        };

        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        headers['Content-Type'] = 'multipart/related; boundary=' + boundary;

        body = 
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: application/json\r\n\r\n' +
          JSON.stringify(data) +
          close_delim;
      }

      const response = await fetch(url, {
        method,
        headers,
        body
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Sync Upload Error: ${response.status} - ${errText}`);
        return false;
      }

      console.log(`Sync: ${method} upload successful.`);
      return true;
    } catch (error) {
      console.error('Sync Upload Exception:', error);
      return false;
    }
  },

  packageFullAppData(): SyncData {
    return {
      vocab: JSON.parse(localStorage.getItem('lingo-bengali-list') || '[]'),
      phrases: JSON.parse(localStorage.getItem('PHRASES_COLLECTION') || '[]'),
      translations: JSON.parse(localStorage.getItem('TRANSLATION_HISTORY') || '[]'),
      syncTime: Number(localStorage.getItem('vocab_master_last_updated') || '0')
    };
  },

  async performSync(silent: boolean = false): Promise<{ status: 'updated' | 'pushed' | 'no-change' | 'error', lastUpdated?: number }> {
    if (!AuthService.isAuthenticated()) {
      if (!silent) {
        console.warn("Sync: User not authenticated, triggering login...");
        AuthService.login();
      }
      return { status: 'error' };
    }

    const localData = this.packageFullAppData();
    const fileId = await this.findMasterFileId();

    if (!fileId) {
      localData.syncTime = Date.now();
      const success = await this.uploadData(localData);
      if (success) {
        localStorage.setItem('vocab_master_last_updated', String(localData.syncTime));
        return { status: 'pushed', lastUpdated: localData.syncTime };
      }
      return { status: 'error' };
    }

    const driveData = await this.downloadData(fileId);
    if (!driveData) {
      console.error("Sync: Failed to download drive data for merge.");
      return { status: 'error' };
    }

    // Handle legacy format if needed, but here we assume the new format for simplicity as per "overhaul" instructions
    const driveSyncTime = driveData.syncTime || (driveData as any).lastUpdated || 0;
    const localSyncTime = localData.syncTime;

    if (driveSyncTime > localSyncTime) {
      console.log("Sync: Pulling newer data from Drive.");
      localStorage.setItem('lingo-bengali-list', JSON.stringify(driveData.vocab || (driveData as any).vocabularyList || []));
      localStorage.setItem('PHRASES_COLLECTION', JSON.stringify(driveData.phrases || (driveData as any).phrasesIdioms || []));
      localStorage.setItem('TRANSLATION_HISTORY', JSON.stringify(driveData.translations || (driveData as any).translationHistory || []));
      
      // If there's daily word state, we can keep it legacy or just ignore it if user didn't ask
      if ((driveData as any).dailyWordState) {
        localStorage.setItem('vocab-master-daily', JSON.stringify((driveData as any).dailyWordState));
      }

      localStorage.setItem('vocab_master_last_updated', String(driveSyncTime));
      return { status: 'updated', lastUpdated: driveSyncTime };
    } else if (localSyncTime > driveSyncTime) {
      console.log("Sync: Pushing newer local data to Drive.");
      const success = await this.uploadData(localData, fileId);
      if (success) return { status: 'pushed', lastUpdated: localSyncTime };
      return { status: 'error' };
    }

    console.log("Sync: Data is identical. No changes required.");
    return { status: 'no-change', lastUpdated: localSyncTime };
  }
};


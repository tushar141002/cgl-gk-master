import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ANDROID = new URL('../../android/app/src/main/', import.meta.url);
const manifest = readFileSync(new URL('AndroidManifest.xml', ANDROID), 'utf8');

/**
 * The Gradle build needs a JDK and the Android SDK, which CI does not have, so
 * these settings are pinned by reading the files (D-089).
 */
describe('Android manifest security', () => {
  it('turns off backup of the session and the attempt log', () => {
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android:fullBackupContent="false"');
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
  });

  it('excludes everything from cloud backup and device transfer on Android 12+', () => {
    const rules = readFileSync(new URL('res/xml/data_extraction_rules.xml', ANDROID), 'utf8');

    for (const section of ['cloud-backup', 'device-transfer']) {
      const body = new RegExp(`<${section}>([\\s\\S]*?)</${section}>`).exec(rules)?.[1] ?? '';
      for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) {
        expect(body, `${section} ${domain}`).toContain(`<exclude domain="${domain}" path="." />`);
      }
    }
  });

  it('never allows plain-HTTP traffic', () => {
    expect(manifest).not.toContain('usesCleartextTraffic="true"');
  });
});

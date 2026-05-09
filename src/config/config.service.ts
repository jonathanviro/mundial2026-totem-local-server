import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const DEFAULTS: Record<string, string> = {
  totem_code:   '',
  totem_name:   'Tótem',
  server_url:   '',
  version_data: '0',
  phase_id:     '',
  campaign_id:  '',
};

@Injectable()
export class ConfigService implements OnModuleInit {
  private cache: Record<string, string> = {};

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // First, ensure all default keys exist in DB
    for (const [key, value] of Object.entries(DEFAULTS)) {
      await this.prisma.config.upsert({
        where: { key },
        update: {},
        create: { key, value },
      });
    }

    // Load all configs into cache
    const all = await this.prisma.config.findMany();
    all.forEach(c => { this.cache[c.key] = c.value; });

    // Always use SERVER_URL from .env if present (overrides DB value)
    const envServerUrl = process.env.SERVER_URL;
    if (envServerUrl) {
      await this.set('server_url', envServerUrl);
    }
  }

  get(key: string, fallback = ''): string {
    return this.cache[key] ?? fallback;
  }

  async set(key: string, value: string): Promise<void> {
    await this.prisma.config.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    this.cache[key] = value;
  }

  async setMany(entries: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value);
    }
  }

  getAll(): Record<string, string> {
    return { ...this.cache };
  }

  get totemCode()    { return this.get('totem_code'); }
  get totemName()    { return this.get('totem_name', 'Tótem'); }
  get serverUrl()    { return this.get('server_url').replace(/\/$/, ''); }
  get versionData()  { return parseInt(this.get('version_data', '0')); }
  get phaseId()      { return this.get('phase_id'); }
  get campaignId()   { return this.get('campaign_id'); }
  get isConfigured() { return !!(this.totemCode && this.serverUrl); }
}

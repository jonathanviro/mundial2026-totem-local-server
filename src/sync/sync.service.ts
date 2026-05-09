import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '../config/config.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private syncing = false;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // Cada 2 horas
  @Cron('0 */2 * * *')
  async scheduledSync() {
    this.logger.log('Sync programado iniciando...');
    await this.fullSync();
  }

  async fullSync(): Promise<{ status: string; message?: string }> {
    if (this.syncing) return { status: 'busy', message: 'Sync en progreso' };
    if (!this.config.isConfigured) {
      return { status: 'not_configured', message: 'Configura el código del tótem y la URL del servidor' };
    }

    this.syncing = true;
    try {
      await this.heartbeat();
      const pull = await this.pullData();
      const push = await this.pushRegistrations();
      return { status: 'ok', message: `${pull.message} | ${push.message}` };
    } catch (err: any) {
      const isOffline = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'].includes(err.code);
      const msg = isOffline ? 'Sin conexión al servidor' : (err.message || 'Error desconocido');
      this.logger.warn(`Sync falló: ${msg}`);
      return { status: 'no_internet', message: msg };
    } finally {
      this.syncing = false;
    }
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  private async heartbeat() {
    try {
      await axios.post(
        `${this.config.serverUrl}/api/sync/heartbeat`,
        { totem_code: this.config.totemCode, version_data: this.config.versionData },
        { timeout: 8000 },
      );
    } catch {
      // heartbeat no es crítico
    }
  }

  // ── Pull: descarga fase activa y partidos del servidor ────────────────────
  async pullData(): Promise<{ message: string; updated: boolean }> {
    const url = `${this.config.serverUrl}/api/sync/data/${this.config.totemCode}`;
    const phaseId = parseInt(this.config.phaseId) || undefined;
    const resp = await axios.get(url, {
      params: {
        version: this.config.versionData,
        phase_id: phaseId, // Send current phase_id as number
      },
      timeout: 20000,
    });

    const data = resp.data;

    if (!data.has_update) {
      return { message: 'Ya actualizado', updated: false };
    }

    // Guardar campaña
    if (data.campaign) {
      await this.prisma.campaign.upsert({
        where: { id: data.campaign.id },
        update: {
          name: data.campaign.name,
          slug: data.campaign.slug,
          bg_screen1_url: data.campaign.bg_screen1_url ?? null,
          bg_screen2_url: data.campaign.bg_screen2_url ?? null,
        },
        create: {
          id: data.campaign.id,
          name: data.campaign.name,
          slug: data.campaign.slug,
          bg_screen1_url: data.campaign.bg_screen1_url ?? null,
          bg_screen2_url: data.campaign.bg_screen2_url ?? null,
        },
      });
      await this.config.set('campaign_id', String(data.campaign.id));
    }

    // Guardar fase
    if (data.phase) {
      await this.prisma.phase.upsert({
        where: { id: data.phase.id },
        update: {
          number: data.phase.number,
          name: data.phase.name,
          date_from: data.phase.date_from ?? null,
          date_to: data.phase.date_to ?? null,
          predictions_required: data.phase.predictions_required,
          min_correct_to_win: data.phase.min_correct_to_win,
          version: data.phase.version,
        },
        create: {
          id: data.phase.id,
          number: data.phase.number,
          name: data.phase.name,
          date_from: data.phase.date_from ?? null,
          date_to: data.phase.date_to ?? null,
          predictions_required: data.phase.predictions_required,
          min_correct_to_win: data.phase.min_correct_to_win,
          version: data.phase.version,
        },
      });
      await this.config.set('phase_id', String(data.phase.id));
    }

    // Guardar partidos
    if (data.matches?.length) {
      for (const m of data.matches) {
        await this.prisma.match.upsert({
          where: { id: m.id },
          update: {
            phase_id: m.phase_id,
            match_number: m.match_number,
            group_name: m.group_name ?? null,
            team_local: m.team_local ?? null,
            team_visitor: m.team_visitor ?? null,
            goals_local: m.goals_local ?? null,
            goals_visitor: m.goals_visitor ?? null,
            finished: m.finished ? 1 : 0,
          },
          create: {
            id: m.id,
            phase_id: m.phase_id,
            match_number: m.match_number,
            group_name: m.group_name ?? null,
            team_local: m.team_local ?? null,
            team_visitor: m.team_visitor ?? null,
            goals_local: m.goals_local ?? null,
            goals_visitor: m.goals_visitor ?? null,
            finished: m.finished ? 1 : 0,
          },
        });
      }
    }

    await this.config.set('version_data', String(data.server_version));
    this.logger.log(`Pull OK → v${data.server_version}, ${data.matches?.length || 0} partidos`);
    return { message: `Actualizado a v${data.server_version}`, updated: true };
  }

  // ── Push: sube registros pendientes al servidor ───────────────────────────
  async pushRegistrations(): Promise<{ message: string; pushed: number }> {
    const pending = await this.prisma.registration.findMany({
      where: { synced: 0 },
      include: { participant: true, predictions: true },
    });

    if (!pending.length) return { message: 'Sin registros pendientes', pushed: 0 };

    const payload = pending.map(reg => ({
      local_id: reg.local_id,
      factura: reg.factura,
      cedula: reg.participant.cedula,
      nombres: reg.participant.nombres,
      apellidos: reg.participant.apellidos,
      telefono: reg.participant.telefono,
      email: reg.participant.email,
      champion_team: reg.champion_team,
      registered_at: reg.registered_at,
      predictions: reg.predictions.map(p => ({
        match_id: p.match_id,
        goals_local: p.goals_local,
        goals_visitor: p.goals_visitor,
      })),
    }));

    const resp = await axios.post(
      `${this.config.serverUrl}/api/sync/push/${this.config.totemCode}`,
      { registrations: payload },
      { timeout: 30000 },
    );

    const results: any[] = resp.data.results || [];
    let pushed = 0;

    for (const result of results) {
      // ok, duplicate_factura y already_synced → marcar como sincronizado
      if (['ok', 'duplicate_factura', 'already_synced'].includes(result.status)) {
        await this.prisma.registration.updateMany({
          where: { local_id: result.local_id },
          data: { synced: 1 },
        });
        pushed++;
      }
      // status: 'error' → se mantiene en 0 para reintentar
    }

    this.logger.log(`Push OK → ${pushed}/${pending.length} registros`);
    return { message: `${pushed} registros enviados`, pushed };
  }

  // ── Estado actual para la UI de configuración ─────────────────────────────
  async getStatus() {
    const [totalRegs, pendingRegs, phase] = await Promise.all([
      this.prisma.registration.count(),
      this.prisma.registration.count({ where: { synced: 0 } }),
      this.prisma.phase.findFirst({
        include: { _count: { select: { matches: true } } },
      }),
    ]);

    return {
      configured:          this.config.isConfigured,
      totem_code:          this.config.totemCode,
      totem_name:          this.config.totemName,
      server_url:          this.config.serverUrl,
      version_data:        this.config.versionData,
      total_registrations: totalRegs,
      pending_sync:        pendingRegs,
      active_phase: phase ? {
        id:                   phase.id,
        name:                 phase.name,
        number:               phase.number,
        predictions_required: phase.predictions_required,
        min_correct_to_win:   phase.min_correct_to_win,
        matches_count:        phase._count.matches,
      } : null,
    };
  }

  // ── Verificar factura (local primero, luego servidor si hay internet) ──────
  async checkFactura(factura: string): Promise<{ available: boolean; source: string }> {
    const local = await this.prisma.registration.findUnique({ where: { factura } });
    if (local) return { available: false, source: 'local' };

    if (this.config.isConfigured) {
      try {
        const resp = await axios.get(
          `${this.config.serverUrl}/api/sync/factura/${this.config.totemCode}/${encodeURIComponent(factura)}`,
          { timeout: 5000 },
        );
        return { available: resp.data.available, source: 'server' };
      } catch {
        // sin internet → confiar solo en local
        return { available: true, source: 'local_only' };
      }
    }

    return { available: true, source: 'local' };
  }
}

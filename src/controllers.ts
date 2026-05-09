import {
  Controller, Get, Post, Put, Body, Param, Logger,
} from '@nestjs/common';
import { SyncService } from './sync/sync.service';
import { ConfigService } from './config/config.service';
import { RegistrationsService, RegisterInput } from './registrations/registrations.service';
import { PrismaService } from './prisma.service';

// ── Health ────────────────────────────────────────────────────────────────
@Controller('api/health')
export class HealthController {
  constructor(private config: ConfigService) {}

  @Get()
  health() {
    return {
      status:    'ok',
      totem:     this.config.totemCode || 'not-configured',
      version:   this.config.versionData,
      timestamp: new Date().toISOString(),
    };
  }
}

// ── Config ────────────────────────────────────────────────────────────────
@Controller('api/config')
export class TotemConfigController {
  constructor(
    private config: ConfigService,
    private sync: SyncService,
  ) {}

  @Get()
  getConfig() {
    return {
      totem_code:    this.config.totemCode,
      totem_name:    this.config.totemName,
      server_url:    this.config.serverUrl,
      version_data:  this.config.versionData,
      is_configured: this.config.isConfigured,
    };
  }

  @Put()
  async updateConfig(@Body() body: {
    totem_code?: string;
    totem_name?: string;
    server_url?: string;
  }) {
    const entries: Record<string, string> = {};
    if (body.totem_code !== undefined) entries['totem_code'] = body.totem_code;
    if (body.totem_name !== undefined) entries['totem_name'] = body.totem_name;
    if (body.server_url !== undefined) entries['server_url'] = body.server_url.replace(/\/$/, '');
    await this.config.setMany(entries);

    // Sync inmediato al guardar config
    if (this.config.isConfigured) {
      setTimeout(() => this.sync.fullSync(), 500);
    }

    return { status: 'ok', config: this.getConfig() };
  }
}

// ── Sync ──────────────────────────────────────────────────────────────────
@Controller('api/sync')
export class SyncController {
  constructor(private sync: SyncService) {}

  @Post('trigger')
  trigger() {
    return this.sync.fullSync();
  }

  @Get('status')
  status() {
    return this.sync.getStatus();
  }
}

// ── Registrations ─────────────────────────────────────────────────────────
@Controller('api/registrations')
export class RegistrationsController {
  constructor(
    private regService: RegistrationsService,
    private sync: SyncService,
  ) {}

  // Verifica disponibilidad de factura (local + servidor si hay internet)
  @Get('check-factura/:factura')
  checkFactura(@Param('factura') factura: string) {
    return this.sync.checkFactura(factura);
  }

  // Pre-llenado por cédula
  @Get('participant/:cedula')
  getParticipant(@Param('cedula') cedula: string) {
    return this.regService.getParticipantByCedula(cedula);
  }

  // Guardar nuevo registro
  @Post()
  async register(@Body() body: RegisterInput) {
    const result = await this.regService.register(body);
    // Intentar sync en background tras cada registro
    setTimeout(() => this.sync.fullSync(), 1000);
    return result;
  }

  @Get('stats')
  stats() {
    return this.regService.getStats();
  }
}

// ── Phases ────────────────────────────────────────────────────────────────
@Controller('api/phase')
export class PhasesController {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // Fase activa + partidos + campaña → el totem-app lo consume al arrancar
  @Get('active')
  async getActive() {
    const phaseId = parseInt(this.config.phaseId);
    if (!phaseId) return { phase: null, matches: [], campaign: null };

    const [phase, campaign] = await Promise.all([
      this.prisma.phase.findUnique({
        where: { id: phaseId },
        include: { matches: { orderBy: { match_number: 'asc' } } },
      }),
      this.config.campaignId
        ? this.prisma.campaign.findUnique({ where: { id: parseInt(this.config.campaignId) } })
        : null,
    ]);

    return { phase, matches: phase?.matches || [], campaign };
  }

  // Equipos únicos de la fase activa → para la grilla de banderas
  @Get('teams')
  async getTeams() {
    const phaseId = parseInt(this.config.phaseId);
    if (!phaseId) return { teams: [], phase_number: null, predictions_required: 3 };

    const [phase, matches] = await Promise.all([
      this.prisma.phase.findUnique({ where: { id: phaseId } }),
      this.prisma.match.findMany({ where: { phase_id: phaseId } }),
    ]);

      const teamsMap = new Map<string, { name: string; flag: string; match_ids: number[] }>();
      for (const m of matches) {
        if (m.team_local) {
          if (!teamsMap.has(m.team_local)) {
            teamsMap.set(m.team_local, { name: m.team_local, flag: '', match_ids: [] });
          }
          teamsMap.get(m.team_local)!.match_ids.push(m.id);
        }
        if (m.team_visitor) {
          if (!teamsMap.has(m.team_visitor)) {
            teamsMap.set(m.team_visitor, { name: m.team_visitor, flag: '', match_ids: [] });
          }
          teamsMap.get(m.team_visitor)!.match_ids.push(m.id);
        }
      }

    return {
      teams: Array.from(teamsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      phase_number:        phase?.number,
      predictions_required: phase?.predictions_required ?? 3,
    };
  }
}

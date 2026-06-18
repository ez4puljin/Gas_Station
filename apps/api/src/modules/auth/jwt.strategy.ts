import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '@fuel/types';

/** Access token-ыг шалгаж req.user (AuthUser) болгоно. DB hit хийхгүй (хурдан). */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: AuthUser): AuthUser {
    return {
      sub: payload.sub,
      employeeId: payload.employeeId,
      companyId: payload.companyId,
      roles: payload.roles,
      stationIds: payload.stationIds,
      allStations: payload.allStations,
    };
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomsService } from './rooms.service';

interface CreateRoomBody {
  name?: string;
  description?: string | null;
  isPublic?: boolean;
  isTournament?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  maxMembers?: number | null;
}

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  /// Create a new room. `isPublic` controls discovery; `isTournament`
  /// requires startsAt + endsAt timestamps. Owner is auto-added as the
  /// first member with their current equity snapshot.
  @Post()
  create(@CurrentUser() user: User, @Body() body: CreateRoomBody) {
    return this.rooms.create(user.id, {
      name: body.name ?? '',
      description: body.description,
      isPublic: body.isPublic ?? false,
      isTournament: body.isTournament ?? false,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      maxMembers: body.maxMembers,
    });
  }

  /// Joins a private room by its 6-char invite code. Case-insensitive.
  @Post('join')
  joinByCode(
    @CurrentUser() user: User,
    @Body() body: { code?: string },
  ) {
    return this.rooms.joinByCode(user.id, body.code ?? '');
  }

  /// Joins a public room by id. Fails with 403 for private rooms.
  @Post(':id/join')
  joinPublic(@CurrentUser() user: User, @Param('id') id: string) {
    return this.rooms.joinPublic(user.id, id);
  }

  /// Leave a room you've joined. Owners can't leave — they close instead.
  @Delete(':id/leave')
  leave(@CurrentUser() user: User, @Param('id') id: string) {
    return this.rooms.leave(user.id, id);
  }

  /// Permanently close (owner only). Cascades all member rows.
  @Delete(':id')
  close(@CurrentUser() user: User, @Param('id') id: string) {
    return this.rooms.close(user.id, id);
  }

  /// Rooms the caller is a member of, with their current return% inline.
  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.rooms.listMine(user.id);
  }

  /// Public discovery. `tournament=true` filters to live tournaments;
  /// `tournament=false` excludes them; omit for both.
  @Get('public')
  publicRooms(
    @CurrentUser() user: User,
    @Query('tournament') tournamentRaw?: string,
    @Query('q') search?: string,
  ) {
    let tournament: boolean | undefined;
    if (tournamentRaw === 'true') tournament = true;
    else if (tournamentRaw === 'false') tournament = false;
    return this.rooms.listPublic({ tournament, search, callerId: user.id });
  }

  /// Room detail + sorted member leaderboard. Membership-gated for
  /// private rooms; anyone can read a public room.
  @Get(':id')
  detail(@CurrentUser() user: User, @Param('id') id: string) {
    return this.rooms.getDetail(id, user.id);
  }
}

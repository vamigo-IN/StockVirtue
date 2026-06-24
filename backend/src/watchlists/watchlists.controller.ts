import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Exchange, isExchange } from '../common/exchange';
import { AddWatchlistItemDto } from './dto/add-watchlist-item.dto';
import { CreateWatchlistDto } from './dto/create-watchlist.dto';
import { ReorderItemsDto } from './dto/reorder-items.dto';
import { UpdateWatchlistDto } from './dto/update-watchlist.dto';
import { WatchlistsService } from './watchlists.service';

@Controller('watchlists')
@UseGuards(JwtAuthGuard)
export class WatchlistsController {
  constructor(private readonly service: WatchlistsService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.service.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateWatchlistDto) {
    return this.service.create(user.id, dto.name);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateWatchlistDto,
  ) {
    return this.service.rename(user.id, id, dto.name);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }

  @Post(':id/items')
  addItem(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AddWatchlistItemDto,
  ) {
    return this.service.addItem(
      user.id,
      id,
      dto.symbol,
      this.parseExchange(dto.exchange ?? 'NSE'),
    );
  }

  @Patch(':id/items/order')
  reorder(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReorderItemsDto,
  ) {
    return this.service.reorderItems(user.id, id, dto.itemIds);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.service.removeItem(user.id, id, itemId);
  }

  @Get(':id/quotes')
  quotes(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.quotes(user.id, id);
  }

  private parseExchange(value: string): Exchange {
    const upper = value.toUpperCase();
    if (!isExchange(upper)) {
      throw new BadRequestException(`Invalid exchange "${value}"`);
    }
    return upper;
  }
}

export enum SaleStatus {
  UPCOMING = 'upcoming',
  ACTIVE = 'active',
  ENDED = 'ended',
}

export class SaleStatusDto {
  status!: SaleStatus;
  startsAt!: string;
  endsAt!: string;
  stockRemaining!: number;
  totalStock!: number;
}

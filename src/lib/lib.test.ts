import { describe, expect, it } from 'vitest'
import { googleMapsUrl, safeUrl } from './maps'
import { evenKeys, keyBetween } from './order'
import { currencyDigits, formatMoney, parseAmount, toTwd } from './money'
import { addDays, dayDate, formatRange, tripDayCount } from './format'

describe('maps', () => {
  it('只接受 http(s) 連結', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl(' https://maps.app.goo.gl/abc ')).toBe('https://maps.app.goo.gl/abc')
    expect(safeUrl('maps.google.com')).toBeNull()
  })

  it('沒填連結時用地址、再來用名稱搜尋', () => {
    expect(googleMapsUrl({ map_url: '', address: '東京都台東区浅草2-3-1', title: '淺草寺' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=%E6%9D%B1%E4%BA%AC%E9%83%BD%E5%8F%B0%E6%9D%B1%E5%8C%BA%E6%B5%85%E8%8D%892-3-1',
    )
    expect(googleMapsUrl({ map_url: 'javascript:x', address: '', title: 'A&B' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=A%26B',
    )
    expect(googleMapsUrl({ map_url: '', address: ' ', title: '' })).toBeNull()
  })
})

describe('order', () => {
  it('取中間值，間距太小時要求重新編號', () => {
    expect(keyBetween(undefined, undefined)).toBe(1024)
    expect(keyBetween(1024, 2048)).toBe(1536)
    expect(keyBetween(undefined, 1024)).toBe(0)
    expect(keyBetween(2048, undefined)).toBe(3072)
    expect(keyBetween(1, 1 + 1e-9)).toBeNull()
    expect(evenKeys(3)).toEqual([1024, 2048, 3072])
  })
})

describe('money', () => {
  it('幣別小數位數', () => {
    expect(currencyDigits('TWD')).toBe(0)
    expect(currencyDigits('JPY')).toBe(0)
    expect(currencyDigits('USD')).toBe(2)
  })

  it('解析輸入的金額', () => {
    expect(parseAmount('', 'USD')).toBeNull()
    expect(parseAmount('1,200', 'JPY')).toBe(1200)
    expect(parseAmount('12.5', 'USD')).toBe(12.5)
    expect(parseAmount('12.5', 'JPY')).toBeNaN()
    expect(parseAmount('-3', 'USD')).toBeNaN()
    expect(parseAmount('1e3', 'USD')).toBeNaN()
  })

  it('換算與顯示', () => {
    expect(toTwd(1000, 'JPY', 0.2135)).toBe(214)
    expect(toTwd(99.6, 'TWD', 5)).toBe(100)
    expect(formatMoney(1234)).toBe('$1,234')
    expect(formatMoney(12.5, 'USD')).toBe('USD 12.5')
    expect(formatMoney(1200, 'JPY')).toBe('JPY 1,200')
  })
})

describe('format', () => {
  it('旅程天數與日期', () => {
    const trip = { start_date: '2026-12-30', end_date: '2027-01-02' }
    expect(tripDayCount(trip)).toBe(4)
    expect(dayDate(trip, 3)).toBe('2027-01-01')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(formatRange('2026-12-30', '2027-01-02')).toBe('2026/12/30（三） – 2027/1/2（六）')
    expect(formatRange('2026-11-01', '2026-11-03')).toBe('2026/11/1（日） – 11/3（二）')
  })
})

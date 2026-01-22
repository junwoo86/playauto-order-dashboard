#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PostgreSQL 스키마 구조 파악 스크립트
테이블: shops, orders, products
"""

import psycopg2
from psycopg2 import sql
import os

# DB 연결 정보
DB_CONFIG = {
    'host': '15.164.112.237',
    'port': 5432,
    'user': 'postgres',
    'password': 'bico0211',
    'database': 'dashboard'
}

SCHEMA = 'playauto_platform'
TARGET_TABLES = ['shops', 'orders', 'products']


def get_connection():
    """PostgreSQL 연결"""
    return psycopg2.connect(**DB_CONFIG)


def get_table_columns(cursor, schema, table_name):
    """테이블의 컬럼 정보 조회"""
    query = """
        SELECT
            c.column_name,
            c.data_type,
            c.character_maximum_length,
            c.is_nullable,
            c.column_default,
            CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END as is_primary_key
        FROM information_schema.columns c
        LEFT JOIN (
            SELECT ku.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage ku
                ON tc.constraint_name = ku.constraint_name
                AND tc.table_schema = ku.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
                AND tc.table_schema = %s
                AND tc.table_name = %s
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_schema = %s AND c.table_name = %s
        ORDER BY c.ordinal_position;
    """
    cursor.execute(query, (schema, table_name, schema, table_name))
    return cursor.fetchall()


def get_table_indexes(cursor, schema, table_name):
    """테이블의 인덱스 정보 조회"""
    query = """
        SELECT
            indexname,
            indexdef
        FROM pg_indexes
        WHERE schemaname = %s AND tablename = %s;
    """
    cursor.execute(query, (schema, table_name))
    return cursor.fetchall()


def get_sample_data(cursor, schema, table_name, limit=5):
    """테이블의 샘플 데이터 조회"""
    query = sql.SQL("SELECT * FROM {}.{} LIMIT %s").format(
        sql.Identifier(schema),
        sql.Identifier(table_name)
    )
    try:
        cursor.execute(query, (limit,))
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        return columns, rows
    except Exception as e:
        return [], []


def get_row_count(cursor, schema, table_name):
    """테이블의 총 레코드 수 조회"""
    query = sql.SQL("SELECT COUNT(*) FROM {}.{}").format(
        sql.Identifier(schema),
        sql.Identifier(table_name)
    )
    try:
        cursor.execute(query)
        return cursor.fetchone()[0]
    except:
        return 0


def print_separator(char='=', length=80):
    print(char * length)


def main():
    print_separator()
    print(f"PostgreSQL 스키마 구조 분석")
    print(f"스키마: {SCHEMA}")
    print(f"대상 테이블: {', '.join(TARGET_TABLES)}")
    print_separator()

    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        # 스키마 내 모든 테이블 목록 조회
        cursor.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """, (SCHEMA,))
        all_tables = [row[0] for row in cursor.fetchall()]

        print(f"\n[스키마 내 전체 테이블 목록]")
        for t in all_tables:
            print(f"  - {t}")
        print()

        # 각 대상 테이블 분석
        for table_name in TARGET_TABLES:
            print_separator('-')
            print(f"\n### 테이블: {SCHEMA}.{table_name}")
            print_separator('-')

            if table_name not in all_tables:
                print(f"  ⚠️ 테이블이 존재하지 않습니다!")
                continue

            # 레코드 수
            row_count = get_row_count(cursor, SCHEMA, table_name)
            print(f"\n총 레코드 수: {row_count:,}건\n")

            # 컬럼 정보
            columns = get_table_columns(cursor, SCHEMA, table_name)
            print(f"[컬럼 정보]")
            print(f"{'컬럼명':<25} {'데이터타입':<20} {'NULL':<6} {'PK':<4} {'기본값':<30}")
            print("-" * 90)
            for col in columns:
                col_name, data_type, max_len, nullable, default, is_pk = col
                type_str = f"{data_type}"
                if max_len:
                    type_str += f"({max_len})"
                default_str = str(default)[:28] if default else ''
                print(f"{col_name:<25} {type_str:<20} {nullable:<6} {is_pk:<4} {default_str:<30}")

            # 인덱스 정보
            indexes = get_table_indexes(cursor, SCHEMA, table_name)
            if indexes:
                print(f"\n[인덱스 정보]")
                for idx in indexes:
                    print(f"  - {idx[0]}")

            # 샘플 데이터
            sample_cols, sample_rows = get_sample_data(cursor, SCHEMA, table_name, 3)
            if sample_rows:
                print(f"\n[샘플 데이터 (최대 3건)]")
                for i, row in enumerate(sample_rows, 1):
                    print(f"\n  --- 레코드 {i} ---")
                    for col, val in zip(sample_cols, row):
                        val_str = str(val)[:60] if val is not None else 'NULL'
                        print(f"  {col}: {val_str}")

            print()

        # products 테이블의 product_code, product_name 전체 목록 출력
        if 'products' in all_tables:
            print_separator('=')
            print("\n### products 테이블 - SKU(product_code)와 상품명(product_name) 전체 목록")
            print_separator('-')

            cursor.execute(f"""
                SELECT product_code, product_name
                FROM {SCHEMA}.products
                ORDER BY product_code
            """)
            products = cursor.fetchall()

            print(f"\n{'SKU (product_code)':<20} {'상품명 (product_name)':<50}")
            print("-" * 70)
            for p in products:
                print(f"{p[0]:<20} {p[1] if p[1] else '':<50}")

            print(f"\n총 {len(products)}개 상품")

        # orders 테이블의 shop_sale_name, shop_opt_name 샘플 조회
        if 'orders' in all_tables:
            print_separator('=')
            print("\n### orders 테이블 - 상품명/옵션명 샘플 (매핑 분석용)")
            print_separator('-')

            cursor.execute(f"""
                SELECT DISTINCT shop_sale_name, shop_opt_name, COUNT(*) as cnt
                FROM {SCHEMA}.orders
                WHERE shop_sale_name IS NOT NULL
                GROUP BY shop_sale_name, shop_opt_name
                ORDER BY cnt DESC
                LIMIT 30
            """)
            order_samples = cursor.fetchall()

            print(f"\n{'상품명 (shop_sale_name)':<50} {'옵션명 (shop_opt_name)':<40} {'건수':<10}")
            print("-" * 100)
            for o in order_samples:
                sale_name = (o[0][:47] + '...') if o[0] and len(o[0]) > 50 else (o[0] or '')
                opt_name = (o[1][:37] + '...') if o[1] and len(o[1]) > 40 else (o[1] or '')
                print(f"{sale_name:<50} {opt_name:<40} {o[2]:<10}")

        print_separator('=')
        print("\n스키마 분석 완료!")

    except Exception as e:
        print(f"\n오류 발생: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    main()

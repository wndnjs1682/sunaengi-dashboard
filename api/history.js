const { db, json } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const s = db();
    const mode = String(req.query.mode || '');

    // =========================================================
    // 운영기록
    // /api/history?mode=operations
    // =========================================================
    if (mode === 'operations') {

      // 운영기록 저장
      if (req.method === 'POST') {
        const body = req.body || {};

        const opDate = String(body.op_date || '').trim();

        if (!opDate) {
          return json(res, 400, {
            error: '운영일자가 없습니다.'
          });
        }

        const row = {
          op_date: opDate,

          prepared:
            Number(body.prepared) || 0,

          paid:
            Number(body.paid) || 0,

          service:
            Number(body.service) || 0,

          client_count:
            Number(body.client_count) || 0,

          tags:
            Array.isArray(body.tags)
              ? body.tags
              : [],

          menu:
            Array.isArray(body.menu)
              ? body.menu
              : [],

          memo:
            String(body.memo || ''),

          start_time:
            body.start_time || null,

          end_time:
            body.end_time || null,

          workers:
            body.workers === '' ||
            body.workers === null ||
            body.workers === undefined
              ? null
              : Number(body.workers),

          waste_item:
            String(body.waste_item || ''),

          waste_qty:
            Number(body.waste_qty) || 0,

          waste_reason:
            String(body.waste_reason || ''),

          updated_at:
            new Date().toISOString()
        };

        const { data, error } = await s
          .from('operation_logs')
          .upsert(row, {
            onConflict: 'op_date'
          })
          .select()
          .single();

        if (error) {
          throw error;
        }

        return json(res, 200, {
          ok: true,
          item: data
        });
      }

      // 운영기록 조회
      if (req.method === 'GET') {

        const date = String(
          req.query.date || ''
        ).trim();

        // 특정 날짜 조회
        if (date) {
          const { data, error } = await s
            .from('operation_logs')
            .select('*')
            .eq('op_date', date)
            .maybeSingle();

          if (error) {
            throw error;
          }

          return json(res, 200, {
            item: data || null
          });
        }

        // 기간 조회
        const start = String(
          req.query.start || '2000-01-01'
        );

        const end = String(
          req.query.end || '2099-12-31'
        );

        const { data, error } = await s
          .from('operation_logs')
          .select('*')
          .gte('op_date', start)
          .lte('op_date', end)
          .order('op_date', {
            ascending: false
          });

        if (error) {
          throw error;
        }

        return json(res, 200, {
          items: data || []
        });
      }

      return json(res, 405, {
        error: '허용되지 않은 요청입니다.'
      });
    }

    // =========================================================
    // 기존 매출 / 지출 / 입금 히스토리
    // 기존 기능 유지
    // =========================================================
    if (req.method !== 'GET') {
      return json(res, 405, {
        error: '허용되지 않은 요청입니다.'
      });
    }

    const start = String(
      req.query.start || '2000-01-01'
    );

    const end = String(
      req.query.end || '2099-12-31'
    );

    const [
      orderResult,
      expenseResult,
      paymentResult
    ] = await Promise.all([

      s
        .from('orders')
        .select('*,clients(name)')
        .gte('order_date', start)
        .lte('order_date', end)
        .order('order_date', {
          ascending: false
        }),

      s
        .from('expenses')
        .select('*')
        .gte('expense_date', start)
        .lte('expense_date', end)
        .order('expense_date', {
          ascending: false
        }),

      s
        .from('payments')
        .select('*,clients(name)')
        .gte('payment_date', start)
        .lte('payment_date', end)
        .order('payment_date', {
          ascending: false
        })

    ]);

    if (orderResult.error) {
      throw orderResult.error;
    }

    if (expenseResult.error) {
      throw expenseResult.error;
    }

    if (paymentResult.error) {
      throw paymentResult.error;
    }

    return json(res, 200, {
      orders: orderResult.data || [],
      expenses: expenseResult.data || [],
      payments: paymentResult.data || []
    });

  } catch (e) {

    console.error(
      '[history.js error]',
      e
    );

    return json(res, 500, {
      error:
        e && e.message
          ? e.message
          : 'history server error'
    });
  }
};

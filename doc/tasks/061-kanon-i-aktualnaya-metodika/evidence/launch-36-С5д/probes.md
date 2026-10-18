# Пробы: вход и ожидаемое до исполнения

Корпус cases.json и expected-probes.json созданы до прогона. А: ручной маршрут по plan:190–267 и spec:31,39; каждый вход отдельно, фиксируются текстовые основания запрета. Б: Python -B, cwd корень назначенного дерева; разрешение destination только в памяти, before content mutant без записи, ожидаемый exit0 проверяющего всех deny/allow условий. Ни старые E, ни чужие destination не открываются на запись. В: ручной маршрут по owner-gate-decisions:14,22; spec:27,29,33,43; assignment:36–48. Не сравнение двух одинаковых JSON вместо смыслового суда.

Поиск: git grep -n -I -e "Канон" -e "current.md" -e "Второе мнение" -- . :(exclude)doc/tasks/**; untracked git ls-files --others --exclude-standard, затем rg при наличии. Положительный fixture probe-inputs/active-control.md, ожидаемое совпадение точной строки. Отсутствующий rg честно NOT VERIFIED именно для rg, fallback Python читающего untracked не называется rg. Тяжёлые/продуктовые тесты не запускаются.

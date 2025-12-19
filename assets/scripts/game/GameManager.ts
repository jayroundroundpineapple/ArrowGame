import { JsonAsset, Prefab, resources, instantiate, Vec3, Node } from 'cc';
import { Macro } from './Macro';
import { mapRoundItem } from './mapRoundItem';

/**
 * 游戏管理器 - 单例模式
 * 负责管理游戏逻辑、关卡数据、地图创建等
 */
export class GameManager {
    private static _instance: GameManager = null;

    // 关卡相关
    private currentLevel: number = 1; // 当前关卡索引，从1开始
    private levelData: any = null; // 关卡数据

    // 地图相关
    private roundItemsArr: mapRoundItem[] = []; // 所有圆圈组件数组
    private gameMapNode: Node = null; // 地图父节点
    private mapRoundItemPre: Prefab = null; // 圆圈预制体
    private roundItemPositions: Map<string, { x: number, y: number }> = new Map(); // 存储每个圆点的坐标，key: "row_col"

    // 箭头路径相关
    private arrowPaths: { x: number, y: number }[][] = []; // 箭头路径数组
    private pathLeftMap: boolean[] = []; // 记录每条路径是否已离开地图，true表示已离开

    private constructor() {
        // 私有构造函数，防止外部实例化
    }

    /**
     * 获取单例实例
     */
    public static getInstance(): GameManager {
        if (!GameManager._instance) {
            GameManager._instance = new GameManager();
        }
        return GameManager._instance;
    }

    /**
     * 初始化游戏管理器
     * @param gameMapNode 地图父节点
     * @param mapRoundItemPre 圆圈预制体
     */
    public init(gameMapNode: Node, mapRoundItemPre: Prefab): void {
        this.gameMapNode = gameMapNode;
        this.mapRoundItemPre = mapRoundItemPre;
    }
    /**
     * 获取方向向量
     * @param x1 起点X坐标
     * @param y1 起点Y坐标
     * @param x2 终点X坐标(箭头起点)
     * @param y2 终点Y坐标(箭头起点)
     * @returns 方向向量 {x, y}，支持上下左右四个基本方向
     *          {x: 0, y: 1} 向上
     *          {x: 0, y: -1} 向下
     *          {x: 1, y: 0} 向右
     *          {x: -1, y: 0} 向左
     *          {x: 0, y: 0} 无方向（斜向或相同点）
     */
    public getDir(x1: number, y1: number, x2: number, y2: number): { x: number, y: number } {
        // 垂直方向：向上
        if (x2 === x1 && y2 > y1) {
            return Macro.ArrowDirection.Up;
        }
        // 垂直方向：向下
        if (x2 === x1 && y2 < y1) {
            return Macro.ArrowDirection.Down;
        }
        // 水平方向：向右
        if (y2 === y1 && x2 > x1) {
            return Macro.ArrowDirection.Right;
        }
        // 水平方向：向左
        if (y2 === y1 && x2 < x1) {
            return Macro.ArrowDirection.Left;
        }
        // 其他情况（斜向或相同点）
        return Macro.ArrowDirection.None;
    }

    /**
     * 加载并初始化关卡
     * @param level 关卡编号，默认1
     */
    public async loadLevel(level: number = 1): Promise<void> {
        this.currentLevel = level;
        this.roundItemsArr = []; // 清空之前的圆圈数组
        this.roundItemPositions.clear(); // 清空坐标记录

        return new Promise((resolve, reject) => {
            // 加载关卡配置文件
            resources.load('config/arrowLevel', JsonAsset, (err, jsonAsset) => {
                if (err) {
                    console.error('加载关卡配置失败:', err);
                    reject(err);
                    return;
                }

                const configData = jsonAsset.json;
                if (!configData || !configData.levels) {
                    console.error('关卡配置数据格式错误');
                    reject(new Error('关卡配置数据格式错误'));
                    return;
                }

                // 获取当前关卡数据
                const levelInfo = configData.levels.find((l: any) => l.level === this.currentLevel);
                if (!levelInfo) {
                    console.error(`未找到关卡 ${this.currentLevel} 的配置`);
                    reject(new Error(`未找到关卡 ${this.currentLevel} 的配置`));
                    return;
                }

                this.levelData = levelInfo;

                // 根据配置创建地图
                if (levelInfo.rowCounts && Array.isArray(levelInfo.rowCounts)) {
                    this.createMapRoundItemsWithRowCounts(levelInfo.rows, levelInfo.rowCounts);
                }

                resolve();
            });
        });
    }
    /**
     * 根据行数和每行的圆点数量创建 mapRoundItem（非规则布局，如菱形）
     * @param rows 总行数
     * @param rowCounts 每行的圆点数量数组
     */
    private createMapRoundItemsWithRowCounts(rows: number, rowCounts: number[]): void {
        if (!this.gameMapNode || !this.mapRoundItemPre) {
            console.error('gameMapNode 或 mapRoundItemPre 未设置');
            return;
        }

        if (rowCounts.length !== rows) {
            console.error(`行数配置错误：总行数 ${rows} 与 rowCounts 数组长度 ${rowCounts.length} 不匹配`);
            return;
        }

        let totalItems = 0;
        for (let row = 0; row < rows; row++) {
            const countInRow = rowCounts[row];
            if (countInRow <= 0) continue;

            // 计算当前行的起始X位置（居中）
            const offsetX = -(countInRow - 1) * Macro.mapRoundHorizontalGap / 2;
            for (let col = 0; col < countInRow; col++) {
                const itemNode = instantiate(this.mapRoundItemPre);

                const x = offsetX + col * Macro.mapRoundHorizontalGap;
                const y = row * Macro.maoRoundVerticalGap;
                itemNode.setPosition(new Vec3(x, y, 0));
                itemNode.setParent(this.gameMapNode);

                const mapRoundItemComp = itemNode.getComponent(mapRoundItem);
                if (mapRoundItemComp) {
                    mapRoundItemComp.initItem(row, col, x, y);
                    this.roundItemsArr.push(mapRoundItemComp);

                    // 记录坐标
                    const key = `${row}_${col}`;
                    this.roundItemPositions.set(key, { x, y });
                }
                totalItems++;
            }
        }

        console.log(`成功创建 ${rows} 行非规则布局的 mapRoundItem，共 ${totalItems} 个`);
        console.log(`每行圆点数量: [${rowCounts.join(', ')}]`);
    }

    /**
     * 初始化箭头路径
     * 自动生成多条路径，覆盖所有圆圈，路径只能上下左右方向
     */
    public initArrowPaths(): void {
        // 清空之前的路径
        this.arrowPaths = [];
        this.pathLeftMap = []; // 清空离开状态数组

        // 用于跟踪哪些圆圈已经被路径覆盖（使用行列key）
        const coveredCircles = new Set<string>();

        // 获取所有圆圈的行列信息
        const allCircles: { row: number, col: number, x: number, y: number }[] = [];
        for (const [key, pos] of this.roundItemPositions.entries()) {
            const [row, col] = key.split('_').map(Number);
            allCircles.push({ row, col, x: pos.x, y: pos.y });
        }

        if (allCircles.length === 0) {
            console.warn('没有找到任何圆圈，无法生成路径');
            return;
        }
      
        // 第一轮：为每个未覆盖的圆圈生成路径
        for (const circle of allCircles) {
            const circleKey = `${circle.row}_${circle.col}`;
            
            // 如果这个圆圈已经被覆盖，跳过
            if (coveredCircles.has(circleKey)) {
                continue;
            }

            // 尝试生成一条路径
            const path = this.generatePathFromCircle(circle.row, circle.col, coveredCircles);

            if (path && path.length >= 2) {
                this.arrowPaths.push(path);
                this.pathLeftMap.push(false);
                
                // 标记路径上的所有圆圈为已覆盖
                for (const point of path) {
                    // 通过坐标找到对应的行列
                    for (const [key, pos] of this.roundItemPositions.entries()) {
                        if (Math.abs(pos.x - point.x) < 0.1 && Math.abs(pos.y - point.y) < 0.1) {
                            coveredCircles.add(key);
                            break;
                        }
                    }
                }
            }
        }
        // 检查是否还有未覆盖的圆圈
        if (coveredCircles.size < allCircles.length) {
            console.warn(`警告：仍有 ${allCircles.length - coveredCircles.size} 个圆圈未被覆盖`);
        }
    }

    /**
     * 从指定圆圈生成一条路径（只能上下左右方向）
     * @param startRow 起始行
     * @param startCol 起始列
     * @param coveredCircles 已覆盖的圆圈集合
     * @returns 生成的路径点数组（反向存储：从尾部到头部）
     */
    private generatePathFromCircle(
        startRow: number, 
        startCol: number, 
        coveredCircles: Set<string>
    ): { x: number, y: number }[] | null {
        const path: { x: number, y: number }[] = [];
        const visited = new Set<string>();
        
        let currentRow = startRow;
        let currentCol = startCol;
        const startKey = `${currentRow}_${currentCol}`;
        
        // 检查起始点是否存在
        const startPos = this.getRoundItemPosition(currentRow, currentCol);
        if (!startPos) {
            return null;
        }

        path.push({ x: startPos.x, y: startPos.y });
        visited.add(startKey);

        // 尝试延伸路径，最多连接3-7个圆圈
        const maxLength = 3 + Math.floor(Math.random() * 5); // 3-7个圆圈

        while (path.length < maxLength) {
            // 查找当前点的相邻圆圈（上下左右方向）
            const adjacentCircles = this.findAdjacentCirclesByRowCol(currentRow, currentCol);

            // 过滤掉已访问和已覆盖的圆圈
            const availableCircles = adjacentCircles.filter(circle => {
                const circleKey = `${circle.row}_${circle.col}`;
                return !visited.has(circleKey) && !coveredCircles.has(circleKey);
            });

            if (availableCircles.length === 0) {
                break; // 没有可用的相邻圆圈，停止延伸
            }

            // 随机选择一个相邻圆圈
            const nextCircle = availableCircles[Math.floor(Math.random() * availableCircles.length)];
            const nextKey = `${nextCircle.row}_${nextCircle.col}`;
            const nextPos = this.getRoundItemPosition(nextCircle.row, nextCircle.col);

            if (nextPos) {
                path.push({ x: nextPos.x, y: nextPos.y });
                visited.add(nextKey);
                currentRow = nextCircle.row;
                currentCol = nextCircle.col;
            } else {
                break;
            }
        }

        // 如果路径长度小于2，返回null
        if (path.length < 2) {
            return null;
        }

        // 路径需要反向存储（从尾部到头部），因为绘制时是从尾部到头部
        return path.reverse();
    }

     	// 第14行              0 1 
        // 第13行            0 1 2 3 
        // 第12行          0 1 2 3 4 5
        // 第11行        0 1 2 3 4 5 6 07
        // 第10行      0 1 2 3 4 5 6 7 08 09
        // 第9行     0 1 2 3 4 5 6 7 8 09 10 11
        // 第8行   0 1 2 3 4 5 6 7 8 09 10 11 12 13
        // 第7行 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15
        // 第6行   0 1 2 3 4 5 6 7 8 09 10 11 12 13
        // 第5行     0 1 2 3 4 5 6 7 08 09 10 11
        // 第4行       0 1 2 3 4 5 6 07 08 09
        // 第3行         0 1 2 3 4 5 06 08
        // 第2行           0 1 2 3 4 05
        // 第1行             0 1 2 3 
        // 第0行               0 1 
    /**
     * 根据行列查找相邻的圆圈（上下左右方向）
     * 使用实际坐标来判断，确保路径不斜
     * @param row 当前行
     * @param col 当前列
     * @returns 相邻圆圈的行列信息数组
     */
    private findAdjacentCirclesByRowCol(row: number, col: number): { row: number, col: number }[] {
        const adjacent: { row: number, col: number }[] = [];
        
        // 获取当前圆圈的坐标
        const currentPos = this.getRoundItemPosition(row, col);
        if (!currentPos) {
            return adjacent;
        }

        const currentX = currentPos.x;
        const currentY = currentPos.y;
        const tolerance = 0.1; // 坐标容差
        const horizontalGap = Macro.mapRoundHorizontalGap;
        const verticalGap = Macro.maoRoundVerticalGap;

        // 遍历所有圆圈，查找上下左右相邻的圆圈（使用实际坐标判断）
        for (const [key, pos] of this.roundItemPositions.entries()) {
            const [otherRow, otherCol] = key.split('_').map(Number);
            
            // 跳过自己
            if (otherRow === row && otherCol === col) {
                continue;
            }

            const dx = Math.abs(pos.x - currentX);
            const dy = Math.abs(pos.y - currentY);

            // 检查是否是上下左右相邻（使用实际坐标和间距判断）
            // 上：x坐标相同（容差内），y = currentY + verticalGap
            if (Math.abs(pos.x - currentX) < tolerance && 
                Math.abs(pos.y - (currentY + verticalGap)) < tolerance) {
                adjacent.push({ row: otherRow, col: otherCol });
            }
            // 下：x坐标相同（容差内），y = currentY - verticalGap
            else if (Math.abs(pos.x - currentX) < tolerance && 
                     Math.abs(pos.y - (currentY - verticalGap)) < tolerance) {
                adjacent.push({ row: otherRow, col: otherCol });
            }
            // 左：y坐标相同（容差内），x = currentX - horizontalGap
            else if (Math.abs(pos.y - currentY) < tolerance && 
                     Math.abs(pos.x - (currentX - horizontalGap)) < tolerance) {
                adjacent.push({ row: otherRow, col: otherCol });
            }
            // 右：y坐标相同（容差内），x = currentX + horizontalGap
            else if (Math.abs(pos.y - currentY) < tolerance && 
                     Math.abs(pos.x - (currentX + horizontalGap)) < tolerance) {
                adjacent.push({ row: otherRow, col: otherCol });
            }
        }

        return adjacent;
    }
    /**
     * 箭头移动方法
     * @param speed 移动速度
     * @param pathIdx 路径索引
     */
    arrowPathMove(speed: number = 5, pathIdx: number): void {
        if (this.pathLeftMap[pathIdx]) {
            // 如果路径已经离开地图，不再移动
            return;
        }

        if (this.arrowPaths[pathIdx] && this.arrowPaths[pathIdx].length > 1) {
            let curPath = this.arrowPaths[pathIdx];
            //处理头部方向移动
            let dir = this.getDir(curPath[1].x, curPath[1].y, curPath[0].x, curPath[0].y);
            curPath[0].x += dir.x * speed;
            curPath[0].y += dir.y * speed;
            //再处理尾部移动
            let lastIdx = this.arrowPaths[pathIdx].length - 1;
            dir = this.getDir(curPath[lastIdx].x, curPath[lastIdx].y, curPath[lastIdx - 1].x, curPath[lastIdx - 1].y);
            curPath[lastIdx].x += dir.x * speed;
            curPath[lastIdx].y += dir.y * speed;
            if (curPath[lastIdx].x == curPath[lastIdx - 1].x && curPath[lastIdx].y == curPath[lastIdx - 1].y) {
                this.arrowPaths[pathIdx].pop();//删除尾部
            }
        }
        if (this.arrowPaths[pathIdx].length <= 1) {
            console.log(`路径${pathIdx}已经离开地图`);
            this.pathLeftMap[pathIdx] = true;      
        }
    }
    /**
     * 检查点击位置是否在路径上
     * @param x 点击X坐标
     * @param y 点击Y坐标
     * @param hitDistance 点击容差距离，默认20
     * @returns 点击到的路径索引，如果没有点击到则返回-1
     */
    public checkPathHit(x: number, y: number, hitDistance: number = 10): number {
        for (let pathIdx = 0; pathIdx < this.arrowPaths.length; pathIdx++) {
            if (this.pathLeftMap[pathIdx]) {
                continue; // 已离开的路径不响应点击
            }

            const path = this.arrowPaths[pathIdx];
            if (!path || path.length < 2) {
                continue;
            }

            // 检查点击位置是否在路径的任意线段上
            for (let i = 0; i < path.length - 1; i++) {
                const startX = path[i + 1].x;
                const startY = path[i + 1].y;
                const endX = path[i].x;
                const endY = path[i].y;

                // 计算点到线段的距离
                const distance = this.pointToLineDistance(x, y, startX, startY, endX, endY);
                // console.log('Jay点到线段距离', i, i + 1, distance);
                if (distance <= hitDistance) {
                    return pathIdx; // 点击到了这条路径
                }
            }
        }
        return -1; // 没有点击到任何路径
    }

    /**
     * 计算点到线段的距离
     * @param px 点X坐标
     * @param py 点Y坐标
     * @param x1 线段起点X
     * @param y1 线段起点Y
     * @param x2 线段终点X
     * @param y2 线段终点Y
     * @returns 距离
     */
    private pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // ========== Getter/Setter ==========

    /**
     * 获取当前关卡数据
     */
    public getLevelData(): any {
        return this.levelData;
    }

    /**
     * 获取当前关卡编号
     */
    public getCurrentLevel(): number {
        return this.currentLevel;
    }

    /**
     * 获取所有圆圈组件数组
     */
    public getRoundItems(): mapRoundItem[] {
        return this.roundItemsArr;
    }

    /**
     * 根据行和列获取圆点的坐标
     * @param row 行索引
     * @param col 列索引
     * @returns 坐标对象 {x, y}，如果不存在则返回 null
     */
    public getRoundItemPosition(row: number, col: number): { x: number, y: number } | null {
        const key = `${row}_${col}`;
        const position = this.roundItemPositions.get(key);
        return position || null;
    }

    /**
     * 根据行和列获取圆点的X坐标
     * @param row 行索引
     * @param col 列索引
     * @returns X坐标，如果不存在则返回 null
     */
    public getRoundItemX(row: number, col: number): number | null {
        const position = this.getRoundItemPosition(row, col);
        return position ? position.x : null;
    }

    /**
     * 根据行和列获取圆点的Y坐标
     * @param row 行索引
     * @param col 列索引
     * @returns Y坐标，如果不存在则返回 null
     */
    public getRoundItemY(row: number, col: number): number | null {
        const position = this.getRoundItemPosition(row, col);
        return position ? position.y : null;
    }

    /**
     * 获取所有圆点坐标的Map
     * @returns Map对象，key为 "row_col"，value为 {x, y}
     */
    public getAllRoundItemPositions(): Map<string, { x: number, y: number }> {
        return this.roundItemPositions;
    }

    /**
     * 检查指定位置是否存在圆点
     * @param row 行索引
     * @param col 列索引
     * @returns 是否存在
     */
    public hasRoundItem(row: number, col: number): boolean {
        const key = `${row}_${col}`;
        return this.roundItemPositions.has(key);
    }

    /**
     * 获取箭头路径数组
     */
    public getArrowPaths(): { x: number, y: number }[][] {
        return this.arrowPaths;
    }

    /**
     * 设置箭头路径
     */
    public setArrowPaths(paths: { x: number, y: number }[][]): void {
        this.arrowPaths = paths.map(path => [...path]);
    }

    /**
     * 添加一条箭头路径
     */
    public addArrowPath(points: { x: number, y: number }[]): void {
        if (points.length >= 2) {
            this.arrowPaths.push([...points]);
            this.pathLeftMap.push(false); // 新路径初始化为未离开
        }
    }

    /**
     * 获取路径离开地图状态数组
     */
    public getPathLeftMap(): boolean[] {
        return this.pathLeftMap;
    }

    /**
     * 检查指定路径是否已离开地图
     * @param pathIdx 路径索引
     */
    public isPathLeftMap(pathIdx: number): boolean {
        return this.pathLeftMap[pathIdx] === true;
    }

    /**
     * 检查是否所有路径都已离开地图（通关条件）
     */
    public areAllPathsLeftMap(): boolean {
        if (this.pathLeftMap.length === 0) {
            return false;
        }
        return this.pathLeftMap.every(left => left === true);
    }

    /**
     * 清空箭头路径
     */
    public clearArrowPaths(): void {
        this.arrowPaths = [];
    }

    /**
     * 切换到下一关
     */
    public async nextLevel(): Promise<void> {
        return this.loadLevel(this.currentLevel + 1);
    }

    /**
     * 切换到指定关卡
     */
    public async switchLevel(level: number): Promise<void> {
        return this.loadLevel(level);
    }
}


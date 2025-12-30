import { JsonAsset, Prefab, resources, instantiate, Vec3, Node } from 'cc';
import { Macro } from './Macro';
import { mapRoundItem } from './mapRoundItem';

/**
 * 圆圈信息接口
 * 包含圆圈的行列索引和坐标信息
 */
export interface ICircleInfo {
    row: number;    // 行索引
    col: number;    // 列索引
    x: number;      // X坐标
    y: number;      // Y坐标
}

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
    private allCircles: ICircleInfo[][] = []; // 所有地图有效圆圈信息
    // 存储每个已激活的圆点坐标，key: "row_col"
    private roundItemPositions: Map<string, { x: number, y: number }> = new Map();

    // 箭头路径相关
    private arrowPaths: { x: number, y: number }[][] = []; // 箭头路径数组
    private pathLeftMap: boolean[] = []; // 记录每条路径是否已离开地图，true表示已离开
    // 记录每条路径的头部位置和方向，用于检查是否面对面
    private pathHeadInfo: { row: number, col: number, dir: { x: number, y: number } }[] = [];

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
                    this.createMapRoundItemsWithRowCounts(levelInfo.rowCounts.length, levelInfo.rowCounts);
                }
                resolve();
            });
        });
    }
    /**
     * 根据行数和每行的圆点数量创建 mapRoundItem（方形网格布局）
     * 创建完整的rows×cols网格，但根据rowCounts来激活每行的某些格子
     * @param rows 总行数
     * @param rowCounts 每行的圆点数量数组，表示每行激活的格子数量（从中间开始）
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

        const maxCols = Math.max(...rowCounts);
        let totalItems = 0;
        let activeItems = 0;

        // 计算中间行的索引，用于Y坐标居中
        const centerRow = (rows - 1) / 2;

        for (let row = 0; row < rows; row++) {
            const countInRow = rowCounts[row];

            // 计算当前行的起始X位置（居中）
            const offsetX = -(maxCols - 1) * Macro.mapRoundHorizontalGap / 2;

            for (let col = 0; col < maxCols; col++) {
                //创建N*N格子地图，但是只激活特定格子
                const itemNode = instantiate(this.mapRoundItemPre);

                const x = offsetX + col * Macro.mapRoundHorizontalGap;
                // Y坐标居中：以中间行为0，上下对称分布
                const y = (row - centerRow) * Macro.maoRoundVerticalGap;
                itemNode.setPosition(new Vec3(x, y, 0));
                itemNode.setParent(this.gameMapNode);
                const mapRoundItemComp = itemNode.getComponent(mapRoundItem);
                if (mapRoundItemComp) {
                    // 判断当前格子是否在激活区域内
                    const centerCol = Math.floor(maxCols / 2);
                    const leftCount = Math.floor(countInRow / 2);
                    const rightCount = countInRow - leftCount;
                    const startCol = centerCol - leftCount;
                    const endCol = centerCol + rightCount - 1;

                    const isInMap = (col >= startCol && col <= endCol);

                    mapRoundItemComp.initItem(row, col, x, y, isInMap);
                    this.roundItemsArr.push(mapRoundItemComp);

                    // 只记录激活的格子坐标
                    if (isInMap) {
                        const key = `${row}_${col}`;
                        this.roundItemPositions.set(key, { x, y });
                        activeItems++;
                    }
                }
                totalItems++;
            }
        }
        console.log('jay地图有效圆圈roundItemPositions', this.roundItemPositions)
        console.log(`成功创建 ${rows} 行 × ${maxCols} 列的方形网格，共 ${totalItems} 个格子，激活 ${activeItems} 个`);
        console.log(`每行激活的格子数量: [${rowCounts.join(', ')}]`);
    }

    /**
     * 初始化箭头路径
     * 优先从配置文件中读取路径，如果没有配置则自动生成
     * 确保所有圆圈都被路径覆盖
     */
    public initArrowPaths(): void {
        // 清空之前的路径
        this.arrowPaths = [];
        this.pathLeftMap = []; // 清空离开状态数组
        this.pathHeadInfo = []; // 清空路径头部信息
        this.allCircles = []; // 清空圆圈数组

        // 获取所有圆圈的行列信息
        for (const [key, pos] of this.roundItemPositions.entries()) {
            const [row, col] = key.split('_').map(Number);
            if (!this.allCircles[row]) {
                this.allCircles[row] = [];
            }
            this.allCircles[row].push({ row, col, x: pos.x, y: pos.y });
        }

        if (this.allCircles.length === 0) {
            console.warn('没有找到任何圆圈，无法生成路径');
            return;
        }

        // 优先从配置文件中读取路径
        if (this.levelData && this.levelData.arrowPaths && this.levelData.arrowPaths.length) {
            this.loadArrowPathsFromConfig(this.levelData.arrowPaths, this.allCircles);
        }
        else {
            // 如果没有配置，自动生成路径
            this.generateArrowPathsAutomatically(this.allCircles);
        }
    }

    /**
     * 从配置文件中加载箭头路径
     * @param configPaths 配置文件中的路径数组，每条路径是 {row, col} 数组
     * @param allCircles 所有圆圈信息
     */
    private loadArrowPathsFromConfig(
        configPaths: { row: number, col: number }[][],
        allCircles: ICircleInfo[][]
    ): void {
        const coveredCircles = new Set<string>();
        const invalidPaths: number[] = [];

        // 遍历配置中的每条路径
        for (let pathIdx = 0; pathIdx < configPaths.length; pathIdx++) {
            const configPath = configPaths[pathIdx];

            if (!Array.isArray(configPath) || configPath.length < 2) {
                console.warn(`路径 ${pathIdx} 配置无效，至少需要2个点`);
                invalidPaths.push(pathIdx);
                continue;
            }

            // 将配置中的 {row, col} 转换为坐标路径
            const path: { x: number, y: number }[] = [];
            let isValid = true;

            for (const point of configPath) {
                if (point.row === undefined || point.col === undefined) {
                    console.warn(`路径 ${pathIdx} 中的点配置无效，缺少 row 或 col`);
                    isValid = false;
                    break;
                }

                const pos = this.getRoundItemPosition(point.row, point.col);
                if (!pos) {
                    console.warn(`路径 ${pathIdx} 中的点 (${point.row}, ${point.col}) 不存在于地图中`);
                    isValid = false;
                    break;
                }

                path.push({ x: pos.x, y: pos.y });
            }

            if (!isValid || path.length < 2) {
                invalidPaths.push(pathIdx);
                continue;
            }

            // 验证路径方向（只能上下左右）
            let pathValid = true;
            for (let i = 0; i < path.length - 1; i++) {
                const dir = this.getDir(path[i + 1].x, path[i + 1].y, path[i].x, path[i].y);
                if (dir.x === 0 && dir.y === 0) {
                    console.warn(`路径 ${pathIdx} 的第 ${i} 段是斜线或无效方向`);
                    pathValid = false;
                    break;
                }
            }

            if (!pathValid) {
                invalidPaths.push(pathIdx);
                continue;
            }

            // 路径需要反向存储（从尾部到头部），因为绘制时是从尾部到头部
            this.arrowPaths.push(path.reverse());
            this.pathLeftMap.push(false);

            // 标记路径上的所有圆圈为已覆盖
            for (const point of configPath) {
                const circleKey = `${point.row}_${point.col}`;
                coveredCircles.add(circleKey);
            }
        }

        if (invalidPaths.length > 0) {
            console.warn(`有 ${invalidPaths.length} 条路径配置无效，已跳过`);
        }
    }
    /**
     * 自动生成箭头路径（当配置文件中没有路径配置时使用）
     * 使用BFS从中心向外遍历，确保所有节点都被覆盖
     * @param allCircles 所有圆圈信息（二维数组，按行组织）
     */
    private generateArrowPathsAutomatically(
        allCircles: ICircleInfo[][]
    ): void {
        const coveredCircles = new Set<string>();
        
        // 1. 找到中心节点（最接近地图中心的节点）
        const centerCircle = this.findCenterCircle(allCircles);
        if (!centerCircle) {
            console.warn('无法找到中心节点');
            return;
        }

        // 2. 使用BFS从中心开始，按距离排序所有节点
        const sortedCircles = this.bfsFromCenter(centerCircle, allCircles);
        console.log(`从中心节点 (${centerCircle.row}, ${centerCircle.col}) 开始，共找到 ${sortedCircles.length} 个节点`);

        // 3. 按距离从近到远遍历，为每个未覆盖的节点生成路径
        for (const circle of sortedCircles) {
            const circleKey = `${circle.row}_${circle.col}`;

            if (coveredCircles.has(circleKey)) {
                continue;
            }

            // 尝试生成路径，优先连接未覆盖的相邻节点
            const path = this.generatePathFromCircleOptimized(circle.row, circle.col, coveredCircles);

            if (path && path.length >= 2) {
                this.arrowPaths.push(path);
                this.pathLeftMap.push(false);

                // 标记路径上的所有圆圈为已覆盖
                this.markPathAsCovered(path, coveredCircles);
            }
        }

        // 4. 验证所有节点是否都被覆盖
        this.validateAllCirclesCovered(allCircles, coveredCircles);
        console.log(`路径生成完成，共生成 ${this.arrowPaths.length} 条路径，覆盖 ${coveredCircles.size} 个节点`);
    }

    /**
     * 找到最接近地图中心的节点
     * @param allCircles 所有圆圈信息
     * @returns 中心节点，如果不存在则返回null
     */
    private findCenterCircle(allCircles: ICircleInfo[][]): ICircleInfo | null {
        if (allCircles.length === 0) {
            return null;
        }

        // 计算所有节点的平均位置（中心点）
        let totalX = 0;
        let totalY = 0;
        let count = 0;

        for (const rowCircles of allCircles) {
            for (const circle of rowCircles) {
                totalX += circle.x;
                totalY += circle.y;
                count++;
            }
        }

        if (count === 0) {
            return null;
        }

        const centerX = totalX / count;
        const centerY = totalY / count;

        // 找到距离中心最近的节点
        let minDistance = Infinity;
        let centerCircle: ICircleInfo | null = null;

        for (const rowCircles of allCircles) {
            for (const circle of rowCircles) {
                const distance = Math.sqrt(
                    Math.pow(circle.x - centerX, 2) + Math.pow(circle.y - centerY, 2)
                );
                if (distance < minDistance) {
                    minDistance = distance;
                    centerCircle = circle;
                }
            }
        }

        return centerCircle;
    }

    /**
     * 使用BFS从中心节点开始遍历，返回按距离排序的所有节点
     * @param centerCircle 中心节点
     * @param allCircles 所有圆圈信息
     * @returns 按距离从近到远排序的节点数组
     */
    private bfsFromCenter(
        centerCircle: ICircleInfo,
        allCircles: ICircleInfo[][]
    ): ICircleInfo[] {
        const visited = new Set<string>();
        const queue: { circle: ICircleInfo, distance: number }[] = [];
        const result: ICircleInfo[] = [];

        // 将中心节点加入队列
        const centerKey = `${centerCircle.row}_${centerCircle.col}`;
        queue.push({ circle: centerCircle, distance: 0 });
        visited.add(centerKey);

        // BFS遍历
        while (queue.length > 0) {
            const { circle, distance } = queue.shift()!;
            result.push(circle);

            // 查找相邻节点
            const adjacentCircles = this.findAdjacentCirclesByRowCol(circle.row, circle.col);

            for (const adj of adjacentCircles) {
                const adjKey = `${adj.row}_${adj.col}`;
                if (!visited.has(adjKey)) {
                    visited.add(adjKey);
                    // 找到对应的完整节点信息
                    const adjCircle = this.getCircleByRowCol(adj.row, adj.col, allCircles);
                    if (adjCircle) {
                        queue.push({ circle: adjCircle, distance: distance + 1 });
                    }
                }
            }
        }

        return result;
    }

    /**
     * 根据行列获取圆圈信息
     * @param row 行索引
     * @param col 列索引
     * @param allCircles 所有圆圈信息
     * @returns 圆圈信息，如果不存在则返回null
     */
    private getCircleByRowCol(
        row: number,
        col: number,
        allCircles: ICircleInfo[][]
    ): ICircleInfo | null {
        if (allCircles[row]) {
            for (const circle of allCircles[row]) {
                if (circle.row === row && circle.col === col) {
                    return circle;
                }
            }
        }
        return null;
    }

    /**
     * 从指定圆圈生成一条路径（优化版，优先连接未覆盖的相邻节点）
     * @param startRow 起始行
     * @param startCol 起始列
     * @param coveredCircles 已覆盖的圆圈集合
     * @returns 生成的路径点数组（反向存储：从尾部到头部）
     */
    private generatePathFromCircleOptimized(
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

        // 尝试延伸路径，优先连接未覆盖的节点
        // 路径长度范围：3-7个圆圈，但优先确保覆盖未覆盖的节点
        const minLength = 3;
        const maxLength = 7;

        while (path.length < maxLength) {
            // 查找当前点的相邻圆圈（上下左右方向）
            const adjacentCircles = this.findAdjacentCirclesByRowCol(currentRow, currentCol);

            // 分离未覆盖和已覆盖的相邻节点
            const uncoveredCircles: { row: number, col: number }[] = [];
            const coveredAdjacentCircles: { row: number, col: number }[] = [];

            for (const circle of adjacentCircles) {
                const circleKey = `${circle.row}_${circle.col}`;
                if (visited.has(circleKey)) {
                    continue; // 跳过已访问的节点
                }
                if (coveredCircles.has(circleKey)) {
                    coveredAdjacentCircles.push(circle);
                } else {
                    uncoveredCircles.push(circle);
                }
            }

            // 优先选择未覆盖的节点
            let nextCircle: { row: number, col: number } | null = null;

            if (uncoveredCircles.length > 0) {
                // 如果有未覆盖的节点，优先选择（随机选择以增加路径多样性）
                nextCircle = uncoveredCircles[Math.floor(Math.random() * uncoveredCircles.length)];
            } else {
                // 没有可用的相邻圆圈，停止延伸
                break;
            }

            if (nextCircle) {
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
            } else {
                break;
            }

            // 如果路径长度达到最小值且没有未覆盖的相邻节点，可以提前结束
            if (path.length >= minLength && uncoveredCircles.length === 0) {
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

    /**
     * 标记路径上的所有圆圈为已覆盖
     * @param path 路径点数组
     * @param coveredCircles 已覆盖的圆圈集合
     */
    private markPathAsCovered(
        path: { x: number, y: number }[],
        coveredCircles: Set<string>
    ): void {
        for (const point of path) {
            for (const [key, pos] of this.roundItemPositions.entries()) {
                if (Math.abs(pos.x - point.x) < 0.1 && Math.abs(pos.y - point.y) < 0.1) {
                    coveredCircles.add(key);
                    break;
                }
            }
        }
    }

    /**
     * 验证所有圆圈是否都被路径覆盖
     * @param allCircles 所有圆圈信息
     * @param coveredCircles 已覆盖的圆圈集合
     */
    private validateAllCirclesCovered(
        allCircles: ICircleInfo[][],
        coveredCircles: Set<string>
    ): void {
        const uncoveredCircles: ICircleInfo[] = [];

        for (const rowCircles of allCircles) {
            for (const circle of rowCircles) {
                const circleKey = `${circle.row}_${circle.col}`;
                if (!coveredCircles.has(circleKey)) {
                    uncoveredCircles.push(circle);
                }
            }
        }

        if (uncoveredCircles.length > 0) {
            console.warn(`警告：有 ${uncoveredCircles.length} 个圆圈未被路径覆盖：`);
            for (const circle of uncoveredCircles) {
                console.warn(`  未覆盖节点: (${circle.row}, ${circle.col})`);
            }
        } else {
            console.log('✓ 所有圆圈都已被路径覆盖');
        }
    }
    /**
     * 根据行列查找相邻的圆圈（上下左右方向）
     * @param row 当前行
     * @param col 当前列
     * @returns 相邻圆圈的行列信息数组
     */
    private findAdjacentCirclesByRowCol(row: number, col: number): { row: number, col: number }[] {
        const adjacent: { row: number, col: number }[] = [];

        // 方形网格布局：直接通过row±1, col±1查找相邻格子
        const directions = [
            { row: row + 1, col: col },     // 上
            { row: row - 1, col: col },     // 下
            { row: row, col: col - 1 },     // 左
            { row: row, col: col + 1 }      // 右
        ];

        for (const dir of directions) {
            // 检查该位置是否存在且是激活的格子
            if (this.hasRoundItem(dir.row, dir.col)) {
                // 进一步检查该格子是否在map中（isInMap）
                const item = this.getRoundItemByRowCol(dir.row, dir.col);
                if (item && item.isInMap) {
                    adjacent.push({ row: dir.row, col: dir.col });
                }
            }
        }

        return adjacent;
    }

    /**
     * 根据行列获取圆点组件
     * @param row 行索引
     * @param col 列索引
     * @returns 圆点组件，如果不存在则返回null
     */
    private getRoundItemByRowCol(row: number, col: number): mapRoundItem | null {
        for (const item of this.roundItemsArr) {
            if (item.RoundIndex === row && item.ColMunIndex === col) {
                return item;
            }
        }
        return null;
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
        // 检查路径是否已离开地图
        const path = this.arrowPaths[pathIdx];
        let shouldLeave = false;

        if (!path || path.length <= 1) {
            shouldLeave = true;
        } else if (path.length === 2) {
            // 路径长度为2时，根据移动方向检查是否超出边界值
            const headX = path[0].x;
            const headY = path[0].y;

            // 获取路径的移动方向（从第二个点指向第一个点，即头部方向）
            const dir = this.getDir(path[1].x, path[1].y, path[0].x, path[0].y);
            if (dir.x > 0) {
                if (headX >= Macro.pathLeaveBoundary.maxX) {
                    shouldLeave = true;
                }
            } else if (dir.x < 0) {
                if (headX <= Macro.pathLeaveBoundary.minX) {
                    shouldLeave = true;
                }
            } else if (dir.y > 0) {
                if (headY >= Macro.pathLeaveBoundary.maxY) {
                    shouldLeave = true;
                }
            } else if (dir.y < 0) {
                if (headY <= Macro.pathLeaveBoundary.minY) {
                    shouldLeave = true;
                }
            } else {
                const isHeadOnMap = this.hasRoundItemByPosition(headX, headY);
                if (!isHeadOnMap) {
                    shouldLeave = true;
                }
            }
        }

        if (shouldLeave) {
            console.log(`路径${pathIdx}已经离开地图，清空路径`);
            // 清空路径数组，确保不再绘制任何点
            this.arrowPaths[pathIdx] = [];
            // 标记为已离开地图
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
                if (distance <= hitDistance) {
                    return pathIdx;
                }
            }
        }
        return -1; // 没有点击到任何路径
    }
    /**方向在同一行或者同一列是否面对面有冲突 */
    private arrowDirIsConflict(dir1: { x: number, y: number }, dir2: { x: number, y: number }): boolean {
        if (dir1.x * dir2.x == -1) {
            return true;
        }
        if (dir1.y * dir2.y == -1) {
            return true;
        }
        return false;
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
     * 检查指定坐标是否存在圆点（通过坐标查找）
     * @param x X坐标
     * @param y Y坐标
     * @returns 是否存在圆点
     */
    public hasRoundItemByPosition(x: number, y: number): boolean {
        const tolerance = 0.1;
        for (const pos of this.roundItemPositions.values()) {
            if (Math.abs(pos.x - x) < tolerance && Math.abs(pos.y - y) < tolerance) {
                return true;
            }
        }
        return false;
    }

    /**
     * 检查路径在指定方向上是否被其他路径阻挡
     * 沿着箭头方向递归检查，直到遇到非地图圆圈的位置
     * @param pathIdx 当前路径索引
     * @param direction 箭头方向 {x, y}
     * @returns true表示被阻挡，false表示可以移动
     */
    public isPathBlocked(pathIdx: number, direction: { x: number, y: number }): boolean {
        if (pathIdx < 0 || pathIdx >= this.arrowPaths.length) {
            return true;
        }

        const path = this.arrowPaths[pathIdx];
        if (!path || path.length < 2) {
            return true;
        }

        if (direction.x === 0 && direction.y === 0) {
            return false;
        }

        const headX = path[0].x;
        const headY = path[0].y;

        const horizontalGap = Macro.mapRoundHorizontalGap;
        const verticalGap = Macro.maoRoundVerticalGap;

        // 沿着箭头方向递归检查，直到遇到非地图圆圈的位置
        let checkX = headX;
        let checkY = headY;
        let step = 0;
        const maxSteps = 50; // 防止无限循环，增加步数以覆盖更大的地图

        while (step < maxSteps) {
            if (direction.x !== 0) {
                checkX = headX + direction.x * horizontalGap * (step + 1);
                checkY = headY;
            } else if (direction.y !== 0) {
                checkX = headX;
                checkY = headY + direction.y * verticalGap * (step + 1);
            } else {
                break;
            }

            const isMapCircle = this.hasRoundItemByPosition(checkX, checkY);
            if (!isMapCircle) {
                // 如果已经不是地图圆圈，说明已经检查完整个方向，没有阻挡
                console.log(`路径 ${pathIdx} 在方向 (${direction.x}, ${direction.y}) 上检查到第 ${step + 1} 步，已超出地图范围，无阻挡`);
                return false;
            }

            // 如果还是地图圆圈，检查这个位置是否有其他路径（除了当前路径）
            const BlockedPathIdx = this.checkPathHit(checkX, checkY, 5)
            if (BlockedPathIdx >= 0 && BlockedPathIdx !== pathIdx && !this.pathLeftMap[BlockedPathIdx]) {
                console.log(`被路径 ${BlockedPathIdx} 阻挡`);
                return true;
            }
            step++;
        }

        // 如果检查了maxSteps次还是地图圆圈，说明可能有问题，返回false允许移动
        console.warn(`路径 ${pathIdx} 方向检查达到最大步数 ${maxSteps}，允许移动`);
        return false;
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
        // 初始化 pathLeftMap，确保长度匹配
        this.pathLeftMap = new Array(paths.length).fill(false);
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


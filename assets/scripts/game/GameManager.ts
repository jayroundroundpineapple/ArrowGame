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
                } else {
                    this.createMapRoundItems(levelInfo.rows, levelInfo.cols);
                }

                resolve();
            });
        });
    }

    /**
     * 根据行数和列数创建 mapRoundItem（规则布局）
     * @param rows 行数
     * @param cols 列数
     */
    private createMapRoundItems(rows: number, cols: number): void {
        if (!this.gameMapNode || !this.mapRoundItemPre) {
            console.error('gameMapNode 或 mapRoundItemPre 未设置');
            return;
        }

        const totalRows = this.levelData.rows;
        const totalCols = this.levelData.cols;

        // 遍历创建每个圆点
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const itemNode = instantiate(this.mapRoundItemPre);
                const x = (col - Math.floor(totalCols / 2)) * Macro.mapRoundHorizontalGap;
                const y = (row * Macro.maoRoundVerticalGap);
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
            }
        }
        console.log(`成功创建 ${rows} 行 ${cols} 列的 mapRoundItem，共 ${rows * cols} 个`);
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
     */
    public initArrows(): void {
        // 清空之前的路径
        this.arrowPaths = [];

        // 示例：设置多条箭头路径，每条路径方向不同，弯弯曲曲的长路径
        // 路径1：向上箭头 - 先向右，再向上，再向左，再向上
        this.arrowPaths.push([
            { x: this.getRoundItemX(0, 1), y: this.getRoundItemY(0, 1) }, //箭头位置
            { x: this.getRoundItemX(1, 2), y: this.getRoundItemY(1, 2) },
            { x: this.getRoundItemX(1, 1), y: this.getRoundItemY(1, 1) },
            { x: this.getRoundItemX(2, 2), y: this.getRoundItemY(2, 2) },
        ]);
        // 第14行              0 1 
        // 第13行            0 1 2 3 
        // 第12行          0 1 2 3 4 05
        // 第11行        0 1 2 3 4 5 06 07
        // 第10行      0 1 2 3 4 5 6 07 08 09
        // 第9行     0 1 2 3 4 5 6 7 08 09 10 11
        // 第8行   0 1 2 3 4 5 6 7 8 09 10 11 12 13
        // 第7行 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15
        // 第6行   0 1 2 3 4 5 6 7 8 9 10 11 12 13
        // 第5行     0 1 2 3 4 5 6 7 8 9 10 11
        // 第4行       0 1 2 3 4 5 6 7 8 9
        // 第3行         0 1 2 3 4 5 6 8
        // 第2行           0 1 2 3 4 5
        // 第1行             0 1 2 3 
        // 第0行               0 1 
        console.log('箭头路径初始化完成');
    }
    /**箭头移动方法*/
    arrowPathMove(speed: number = 5, pathIdx: number) {
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
            if(curPath[lastIdx].x == curPath[lastIdx-1].x && curPath[lastIdx].y == curPath[lastIdx-1].y){
                this.arrowPaths[pathIdx].pop();//删除尾部
            }
        }
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
        }
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


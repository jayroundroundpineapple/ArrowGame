import { _decorator, Color, Component, Graphics, JsonAsset, Node, Prefab, resources, instantiate, Vec3 } from 'cc';
import { Macro } from './Macro';
import { mapRoundItem } from './mapRoundItem';
const { ccclass, property } = _decorator;

@ccclass('GameUI')
export class GameUI extends Component {
    @property(Graphics)
    private arrowGraphics: Graphics = null;
    @property(Node)
    private gameMapNode: Node = null;
    @property(Prefab)
    private mapRoundItemPre: Prefab = null;

    private static _instance: GameUI = null;
    _arrowPaths: { x: number, y: number }[][] = [];
    private currentLevel: number = 1; // 当前关卡索引，从1开始
    private levelData: any = null; // 关卡数据
    protected onLoad(): void {
        if (!GameUI._instance) {
            GameUI._instance = this;
        } else {
            GameUI._instance = this;
        }
    }
    public static getInstance(): GameUI {
        return GameUI._instance;
    }
    start() {
        (window as any).gameUI = this;
        this.arrowGraphics.node.setParent(this.gameMapNode);
        this.initMap();
        // 示例：设置多条箭头路径，每条路径方向不同，弯弯曲曲的长路径
        // 路径1：向上箭头 - 先向右，再向上，再向左，再向上
        this._arrowPaths.push([
            { x: 0, y: 100 },
            { x: 50, y: 100 },
            { x: 50, y: 150 },
            { x: 0, y: 150 },
            { x: 0, y: 200 }
        ]);
        
        // 路径2：向下箭头 - 先向左，再向下，再向右，再向下
        this._arrowPaths.push([
            { x: 150, y: 200 },
            { x: 100, y: 200 },
            { x: 100, y: 150 },
            { x: 150, y: 150 },
            { x: 150, y: 100 }
        ]);
        
        // 路径3：向右箭头 - 先向上，再向右，再向下，再向右
        this._arrowPaths.push([
            { x: 0, y: 0 },
            { x: 0, y: 50 },
            { x: 50, y: 50 },
            { x: 50, y: 0 },
            { x: 100, y: 0 }
        ]);
        
        // 路径4：向左箭头 - 先向下，再向左，再向上，再向左
        this._arrowPaths.push([
            { x: 250, y: 0 },
            { x: 250, y: -50 },
            { x: 200, y: -50 },
            { x: 200, y: 0 },
            { x: 150, y: 0 }
        ]);
        
        // 路径5：向上箭头 - 先向右，再向上，再向左，再向上，再向右
        this._arrowPaths.push([
            { x: 200, y: -100 },
            { x: 250, y: -100 },
            { x: 250, y: -50 },
            { x: 200, y: -50 },
            { x: 200, y: 0 },
            { x: 250, y: 0 }
        ]);
        
        // 路径6：向下箭头 - 先向左，再向下，再向右，再向下，再向左
        this._arrowPaths.push([
            { x: 350, y: 100 },
            { x: 300, y: 100 },
            { x: 300, y: 50 },
            { x: 350, y: 50 },
            { x: 350, y: 0 },
            { x: 300, y: 0 }
        ]);

        // 绘制所有箭头路径
        this.draw();
    }
    /**
     * 初始化地图
     * 读取关卡配置并创建 mapRoundItem
     */
    initMap() {
        // 加载关卡配置文件
        resources.load('config/arrowLevel', JsonAsset, (err, jsonAsset) => {
            if (err) {
                console.error('加载关卡配置失败:', err);
                return;
            }

            const configData = jsonAsset.json;
            if (!configData || !configData.levels) {
                console.error('关卡配置数据格式错误');
                return;
            }

            // 获取当前关卡数据（默认第一关）
            const levelInfo = configData.levels.find((level: any) => level.level === this.currentLevel);
            if (!levelInfo) {
                console.error(`未找到关卡 ${this.currentLevel} 的配置`);
                return;
            }

            this.levelData = levelInfo;
            // 如果有关键字 rowCounts，使用非规则布局，否则使用规则布局
            if (levelInfo.rowCounts && Array.isArray(levelInfo.rowCounts)) {
                this.createMapRoundItemsWithRowCounts(levelInfo.rows, levelInfo.rowCounts);
            } else {
                this.createMapRoundItems(levelInfo.rows, levelInfo.cols);
            }
        });
    }

    /**
     * 根据行数和列数创建 mapRoundItem
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
        // 遍历创建每个圆点 mapNode锚点为(0.5,0)
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                // 实例化预制体
                const itemNode = instantiate(this.mapRoundItemPre);
                // 设置位置
                const x =  (col - Math.floor(totalCols / 2)) * Macro.mapRoundHorizontalGap;
                const y =  (row * Macro.maoRoundVerticalGap);
                itemNode.setPosition(new Vec3(x, y, 0));
                
                // 设置父节点
                itemNode.setParent(this.gameMapNode);
                
                // 获取 mapRoundItem 组件并初始化
                const mapRoundItemComp = itemNode.getComponent(mapRoundItem);
                if (mapRoundItemComp) {
                    mapRoundItemComp.initItem(row, col);
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

        // 找到最大圆点数量，用于计算居中偏移
        const maxCount = Math.max(...rowCounts);
        let totalItems = 0;

        // 遍历每一行
        for (let row = 0; row < rows; row++) {
            const countInRow = rowCounts[row];
            if (countInRow <= 0) continue;

            // 计算当前行的起始X位置（居中）
            const offsetX = -(countInRow - 1) * Macro.mapRoundHorizontalGap / 2;

            // 在当前行创建圆点
            for (let col = 0; col < countInRow; col++) {
                // 实例化预制体
                const itemNode = instantiate(this.mapRoundItemPre);
                
                // 设置位置（每行居中）
                const x = offsetX + col * Macro.mapRoundHorizontalGap;
                const y = row * Macro.maoRoundVerticalGap;
                itemNode.setPosition(new Vec3(x, y, 0));
                
                // 设置父节点
                itemNode.setParent(this.gameMapNode);
                
                // 获取 mapRoundItem 组件并初始化
                const mapRoundItemComp = itemNode.getComponent(mapRoundItem);
                if (mapRoundItemComp) {
                    mapRoundItemComp.initItem(row, col);
                }
                totalItems++;
            }
        }

        console.log(`成功创建 ${rows} 行非规则布局的 mapRoundItem，共 ${totalItems} 个`);
        console.log(`每行圆点数量: [${rowCounts.join(', ')}]`);
    }
    /**
     * 绘制箭头路径
     * 遍历 _arrowPaths 数组，绘制每条路径的线段和箭头
     */
    private draw(): void {
        if (!this.arrowGraphics) return;
        if (this._arrowPaths.length === 0) return;

        this.arrowGraphics.clear();
        this.arrowGraphics.lineCap = Graphics.LineCap.ROUND;
        this.arrowGraphics.lineWidth = 8;
        this.arrowGraphics.strokeColor = new Color(0, 0, 0, 255);
        this.arrowGraphics.fillColor = new Color(0, 0, 0, 255);

        // 遍历所有路径
        for (let pathIndex = 0; pathIndex < this._arrowPaths.length; pathIndex++) {
            const path = this._arrowPaths[pathIndex];
            // 至少需要2个点才能绘制
            if (path.length < 2) continue;

            // 遍历当前路径的点，绘制每段线段
            for (let i = 0; i < path.length - 1; i++) {
                const startX = path[i + 1].x;
                const startY = path[i + 1].y;
                const endX = path[i].x;
                const endY = path[i].y;
                // 绘制线段
                this.arrowGraphics.moveTo(startX, startY);
                this.arrowGraphics.lineTo(endX, endY);
                this.arrowGraphics.stroke();
                // 在路径头部（第一个线段）绘制箭头
                if (i == 0) {
                    // 在路径头部绘制箭头，方向从起点指向终点
                    const dir = this.getDir(startX, startY, endX, endY);
                    this.drawArrow(endX, endY, dir);
                }
            }
        }
    }
    private drawArrow(endX: number,endY: number, dir: { x: number, y: number }): void {
        this.arrowGraphics.moveTo(endX + dir.x * 15, endY + dir.y * 15);
        this.arrowGraphics.lineTo(endX - dir.y * 15, endY + dir.x * 15);
        this.arrowGraphics.lineTo(endX + dir.y * 15, endY - dir.x * 15);
        this.arrowGraphics.close();
        this.arrowGraphics.fillColor = (new Color(0, 0, 0, 255));
        this.arrowGraphics.fill();
    }
    /**
     * 获取方向向量
     * @param x1 起点X坐标
     * @param y1 起点Y坐标
     * @param x2 终点X坐标
     * @param y2 终点Y坐标
     * @returns 方向向量 {x, y}，支持上下左右四个基本方向
     *          {x: 0, y: 1} 向上
     *          {x: 0, y: -1} 向下
     *          {x: 1, y: 0} 向右
     *          {x: -1, y: 0} 向左
     *          {x: 0, y: 0} 无方向（斜向或相同点）
     */
    private getDir(x1: number, y1: number, x2: number, y2: number): { x: number, y: number } {
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
     * 清空所有箭头路径
     */
    public clearArrowPath(): void {
        this._arrowPaths = [];
        if (this.arrowGraphics) {
            this.arrowGraphics.clear();
        }
    }

    /**
     * 添加一条新的箭头路径
     * @param points 路径点数组
     */
    public addArrowPath(points: { x: number, y: number }[]): void {
        if (points.length >= 2) {
            this._arrowPaths.push([...points]);
            this.draw();
        }
    }

    /**
     * 设置所有箭头路径并重新绘制
     * @param paths 路径数组，每个元素是一条路径
     */
    public setArrowPaths(paths: { x: number, y: number }[][]): void {
        this._arrowPaths = paths.map(path => [...path]);
        this.draw();
    }
}

